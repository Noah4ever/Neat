#include "api/API.hpp"
#include <array>
#include <cstdio>
#include <memory>

#include "cJSON.h"
#include "esp_err.h"
#include "esp_http_server.h"
#include "esp_spiffs.h"

namespace {

struct WebSocketWork {
  API *api;
  std::string message;
};

using JsonPtr = std::unique_ptr<cJSON, decltype(&cJSON_Delete)>;
using JsonStringPtr = std::unique_ptr<char, decltype(&cJSON_free)>;

constexpr char kWebPartitionLabel[] = "web";
constexpr char kWebBasePath[] = "/web";

const char *contentTypeForPath(const std::string &path) {
  if (path.ends_with(".html")) {
    return "text/html";
  }
  if (path.ends_with(".js")) {
    return "text/javascript";
  }
  if (path.ends_with(".css")) {
    return "text/css";
  }
  if (path.ends_with(".svg")) {
    return "image/svg+xml";
  }
  if (path.ends_with(".png")) {
    return "image/png";
  }
  if (path.ends_with(".jpg") || path.ends_with(".jpeg")) {
    return "image/jpeg";
  }
  if (path.ends_with(".webp")) {
    return "image/webp";
  }
  if (path.ends_with(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}

} // namespace

API::API(MachineLogic &machineLogic, WiFiController &wifiController,
         RecipeConfigRepository &recipeRepository,
         IngredientConfigRepository &ingredientRepository,
         PumpConfigRepository &pumpRepository)
    : machineLogic_(machineLogic), wifiController_(wifiController),
      recipeRepository_(recipeRepository),
      ingredientRepository_(ingredientRepository),
      pumpRepository_(pumpRepository) {}

esp_err_t API::start() {
  esp_err_t result = mountWebFileSystem();
  if (result != ESP_OK) {
    return result;
  }

  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.uri_match_fn = httpd_uri_match_wildcard;

  result = httpd_start(&server_, &config);

  if (result != ESP_OK) {
    if (webFileSystemMounted_) {
      esp_vfs_spiffs_unregister(kWebPartitionLabel);
      webFileSystemMounted_ = false;
    }
    return result;
  }

  result = registerRoutes();

  if (result != ESP_OK) {
    httpd_stop(server_);
    server_ = nullptr;
    if (webFileSystemMounted_) {
      esp_vfs_spiffs_unregister(kWebPartitionLabel);
      webFileSystemMounted_ = false;
    }
    return result;
  }

  wifiController_.setScanFinishedCallback(
      [this](const std::vector<WiFiNetwork> &networks) {
        handleWiFiScanFinished(networks);
      });

  return ESP_OK;
}

void API::stop() {
  wifiController_.setScanFinishedCallback({});

  if (server_ != nullptr) {
    httpd_stop(server_);
    server_ = nullptr;
  }

  if (webFileSystemMounted_) {
    esp_vfs_spiffs_unregister(kWebPartitionLabel);
    webFileSystemMounted_ = false;
  }
}

void API::sendWebSocketMessage(const std::string &message) {
  if (server_ == nullptr) {
    return;
  }

  auto *work = new WebSocketWork{.api = this, .message = message};

  const esp_err_t result =
      httpd_queue_work(server_, &API::sendWebSocketWork, work);

  if (result != ESP_OK) {
    delete work;
  }
}

esp_err_t API::mountWebFileSystem() {
  if (esp_spiffs_mounted(kWebPartitionLabel)) {
    return ESP_OK;
  }

  const esp_vfs_spiffs_conf_t config = {
      .base_path = kWebBasePath,
      .partition_label = kWebPartitionLabel,
      .max_files = 8,
      .format_if_mount_failed = false,
  };

  const esp_err_t result = esp_vfs_spiffs_register(&config);
  if (result == ESP_OK) {
    webFileSystemMounted_ = true;
  }
  return result;
}

esp_err_t API::registerRoutes() {
  httpd_uri_t healthRoute = {};
  healthRoute.uri = "/api/health";
  healthRoute.method = HTTP_GET;
  healthRoute.handler = &API::healthHandler;
  healthRoute.user_ctx = this;

  esp_err_t result = httpd_register_uri_handler(server_, &healthRoute);

  if (result != ESP_OK) {
    return result;
  }

  httpd_uri_t networkScanRoute = {};
  networkScanRoute.uri = "/api/network/scan";
  networkScanRoute.method = HTTP_POST;
  networkScanRoute.handler = &API::networkScanHandler;
  networkScanRoute.user_ctx = this;

  result = httpd_register_uri_handler(server_, &networkScanRoute);

  if (result != ESP_OK) {
    return result;
  }

  httpd_uri_t websocketRoute = {};
  websocketRoute.uri = "/ws";
  websocketRoute.method = HTTP_GET;
  websocketRoute.handler = &API::websocketHandler;
  websocketRoute.user_ctx = this;
  websocketRoute.is_websocket = true;

  result = httpd_register_uri_handler(server_, &websocketRoute);

  if (result != ESP_OK) {
    return result;
  }

  httpd_uri_t staticFileRoute = {};
  staticFileRoute.uri = "/*";
  staticFileRoute.method = HTTP_GET;
  staticFileRoute.handler = &API::staticFileHandler;
  staticFileRoute.user_ctx = this;

  result = httpd_register_uri_handler(server_, &staticFileRoute);

  if (result != ESP_OK) {
    return result;
  }

  return ESP_OK;
}

esp_err_t API::websocketHandler(httpd_req_t *req) {
  auto *api = static_cast<API *>(req->user_ctx);

  return api->handleWebsocket(req);
}

esp_err_t API::handleWebsocket(httpd_req_t *req) {
  if (req->method == HTTP_GET) {
    return ESP_OK;
  }

  httpd_ws_frame_t frame = {};

  esp_err_t result = httpd_ws_recv_frame(req, &frame, 0);

  if (result != ESP_OK) {
    return result;
  }

  // Für jetzt interessieren uns eingehende Nachrichten noch nicht.
  return ESP_OK;
}

void API::sendWebSocketWork(void *arg) {
  auto *work = static_cast<WebSocketWork *>(arg);

  work->api->broadcastWebSocketMessage(work->message);

  delete work;
}

void API::broadcastWebSocketMessage(const std::string &message) {

  constexpr size_t MAX_CLIENTS = 8;

  int clientFds[MAX_CLIENTS];
  size_t clientCount = MAX_CLIENTS;

  if (httpd_get_client_list(server_, &clientCount, clientFds) != ESP_OK) {
    return;
  }

  httpd_ws_frame_t frame = {};

  frame.type = HTTPD_WS_TYPE_TEXT;
  frame.payload =
      reinterpret_cast<uint8_t *>(const_cast<char *>(message.data()));
  frame.len = message.size();

  for (size_t i = 0; i < clientCount; ++i) {
    const int fd = clientFds[i];

    if (httpd_ws_get_fd_info(server_, fd) != HTTPD_WS_CLIENT_WEBSOCKET) {
      continue;
    }

    httpd_ws_send_frame_async(server_, fd, &frame);
  }
}

esp_err_t API::healthHandler(httpd_req_t *req) {
  auto *api = static_cast<API *>(req->user_ctx);

  return api->handleHealth(req);
}

esp_err_t API::handleHealth(httpd_req_t *req) {
  httpd_resp_set_type(req, "application/json");

  return httpd_resp_send(req, R"({"status":"ok"})", HTTPD_RESP_USE_STRLEN);
}

esp_err_t API::networkScanHandler(httpd_req_t *req) {
  auto *api = static_cast<API *>(req->user_ctx);
  return api->handleNetworkScan(req);
}

esp_err_t API::handleNetworkScan(httpd_req_t *req) {
  const esp_err_t result = wifiController_.startScan();

  httpd_resp_set_type(req, "application/json");
  if (result == ESP_OK) {
    httpd_resp_set_status(req, "202 Accepted");
    return httpd_resp_send(req, R"({"status":"scanning"})",
                           HTTPD_RESP_USE_STRLEN);
  }
  if (result == ESP_ERR_INVALID_STATE) {
    httpd_resp_set_status(req, "409 Conflict");
    return httpd_resp_send(req, R"({"error":"scan_in_progress"})",
                           HTTPD_RESP_USE_STRLEN);
  }

  httpd_resp_set_status(req, "500 Internal Server Error");
  return httpd_resp_send(req, R"({"error":"scan_failed"})",
                         HTTPD_RESP_USE_STRLEN);
}

esp_err_t API::staticFileHandler(httpd_req_t *req) {
  auto *api = static_cast<API *>(req->user_ctx);
  return api->handleStaticFile(req);
}

esp_err_t API::handleStaticFile(httpd_req_t *req) {
  std::string uri = req->uri;
  const std::size_t queryStart = uri.find('?');
  if (queryStart != std::string::npos) {
    uri.resize(queryStart);
  }

  if (uri == "/") {
    return sendFile(req, "/web/index.html");
  }

  const bool isAsset =
      uri.starts_with("/assets/") || uri.starts_with("/drinks/");
  const bool isRootFile = uri == "/favicon.svg" || uri == "/icons.svg";
  if ((!isAsset && !isRootFile) || uri.find("..") != std::string::npos) {
    return httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "Not found");
  }

  return sendFile(req, std::string(kWebBasePath) + uri);
}

esp_err_t API::sendFile(httpd_req_t *req, const std::string &path) {
  FILE *file = std::fopen(path.c_str(), "rb");
  if (file == nullptr) {
    return httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "Not found");
  }

  httpd_resp_set_type(req, contentTypeForPath(path));
  if (path.find("/assets/") != std::string::npos) {
    httpd_resp_set_hdr(req, "Cache-Control", "public, max-age=31536000, immutable");
  }

  std::array<char, 1024> buffer{};
  esp_err_t result = ESP_OK;
  while (const std::size_t bytesRead =
             std::fread(buffer.data(), 1, buffer.size(), file)) {
    result = httpd_resp_send_chunk(req, buffer.data(), bytesRead);
    if (result != ESP_OK) {
      break;
    }
  }

  const bool readFailed = std::ferror(file) != 0;
  std::fclose(file);

  if (result != ESP_OK) {
    httpd_resp_send_chunk(req, nullptr, 0);
    return result;
  }
  if (readFailed) {
    httpd_resp_send_chunk(req, nullptr, 0);
    return ESP_FAIL;
  }
  return httpd_resp_send_chunk(req, nullptr, 0);
}

void API::handleWiFiScanFinished(const std::vector<WiFiNetwork> &networks) {
  JsonPtr root(cJSON_CreateObject(), cJSON_Delete);
  JsonPtr networkArray(cJSON_CreateArray(), cJSON_Delete);
  if (!root || !networkArray) {
    return;
  }

  if (cJSON_AddStringToObject(root.get(), "type", "wifi_scan_done") == nullptr) {
    return;
  }

  for (const WiFiNetwork &network : networks) {
    cJSON *item = cJSON_CreateObject();
    if (item == nullptr ||
        cJSON_AddStringToObject(item, "ssid", network.ssid.c_str()) == nullptr ||
        cJSON_AddNumberToObject(item, "rssi", network.rssi) == nullptr ||
        cJSON_AddBoolToObject(item, "secure", network.secure) == nullptr ||
        !cJSON_AddItemToArray(networkArray.get(), item)) {
      cJSON_Delete(item);
      return;
    }
  }

  if (!cJSON_AddItemToObject(root.get(), "networks", networkArray.get())) {
    return;
  }
  networkArray.release();

  JsonStringPtr message(cJSON_PrintUnformatted(root.get()), cJSON_free);
  if (message) {
    sendWebSocketMessage(message.get());
  }
}
