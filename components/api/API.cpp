#include "api/API.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <limits>
#include <memory>
#include <optional>
#include <string_view>
#include <utility>

#include "cJSON.h"
#include "esp_app_desc.h"
#include "esp_err.h"
#include "esp_http_server.h"
#include "esp_netif.h"
#include "esp_spiffs.h"
#include "esp_system.h"
#include "recipe/RecipeResults.hpp"

namespace {

struct WebSocketWork {
  API *api;
  std::string message;
};

using JsonPtr = std::unique_ptr<cJSON, decltype(&cJSON_Delete)>;
using JsonStringPtr = std::unique_ptr<char, decltype(&cJSON_free)>;

constexpr char kWebPartitionLabel[] = "web";
constexpr char kWebBasePath[] = "/web";
constexpr int kMaximumJsonBodySize = 16 * 1024;

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

esp_err_t sendJson(httpd_req_t *req, cJSON *json,
                   const char *status = "200 OK") {
  if (json == nullptr) {
    return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR,
                               "Could not create JSON");
  }

  JsonStringPtr text(cJSON_PrintUnformatted(json), cJSON_free);
  if (!text) {
    return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR,
                               "Could not create JSON");
  }

  httpd_resp_set_status(req, status);
  httpd_resp_set_type(req, "application/json");
  return httpd_resp_send(req, text.get(), HTTPD_RESP_USE_STRLEN);
}

esp_err_t sendError(httpd_req_t *req, const char *status, const char *error) {
  JsonPtr json(cJSON_CreateObject(), cJSON_Delete);
  if (json && cJSON_AddStringToObject(json.get(), "error", error)) {
    return sendJson(req, json.get(), status);
  }
  return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, error);
}

esp_err_t sendNoContent(httpd_req_t *req) {
  httpd_resp_set_status(req, "204 No Content");
  return httpd_resp_send(req, nullptr, 0);
}

JsonPtr readJsonBody(httpd_req_t *req) {
  if (req->content_len <= 0 || req->content_len > kMaximumJsonBodySize) {
    return JsonPtr(nullptr, cJSON_Delete);
  }

  std::string body(static_cast<std::size_t>(req->content_len), '\0');
  int received = 0;
  while (received < req->content_len) {
    const int result = httpd_req_recv(req, body.data() + received,
                                      req->content_len - received);
    if (result <= 0) {
      return JsonPtr(nullptr, cJSON_Delete);
    }
    received += result;
  }

  return JsonPtr(cJSON_ParseWithLength(body.data(), body.size()), cJSON_Delete);
}

template <typename Integer>
bool readUnsigned(const cJSON *value, Integer &result) {
  if (!cJSON_IsNumber(value) || !std::isfinite(value->valuedouble) ||
      value->valuedouble < 0 ||
      std::floor(value->valuedouble) != value->valuedouble) {
    return false;
  }

  constexpr double maxValue = [] {
    if constexpr (std::numeric_limits<Integer>::digits > 53) {
      // Largest integer that a double can represent exactly.
      return 9007199254740991.0; // 2^53 - 1
    } else {
      return static_cast<double>(std::numeric_limits<Integer>::max());
    }
  }();

  if (value->valuedouble > maxValue) {
    return false;
  }

  result = static_cast<Integer>(value->valuedouble);
  return true;
}

std::string requestPath(const httpd_req_t *req) {
  std::string path(req->uri);
  if (const std::size_t query = path.find('?'); query != std::string::npos) {
    path.resize(query);
  }
  return path;
}

template <typename Integer>
bool readIdFromPath(const std::string &path, std::string_view prefix,
                    Integer &id, std::string &suffix) {
  if (!path.starts_with(prefix)) {
    return false;
  }

  const std::size_t idStart = prefix.size();
  const std::size_t slash = path.find('/', idStart);
  const std::string idText = path.substr(idStart, slash - idStart);
  if (idText.empty() ||
      idText.find_first_not_of("0123456789") != std::string::npos) {
    return false;
  }

  std::uint64_t parsed = 0;
  for (const char digit : idText) {
    parsed = parsed * 10 + static_cast<unsigned>(digit - '0');
    if (parsed > std::numeric_limits<Integer>::max()) {
      return false;
    }
  }
  id = static_cast<Integer>(parsed);

  suffix = slash == std::string::npos ? "" : path.substr(slash);
  return true;
}

cJSON *ingredientJson(const IngredientConfig &ingredient) {
  const char *category = "OTHER";
  switch (ingredient.category) {
  case IngredientCategory::ALCOHOL: category = "ALCOHOL"; break;
  case IngredientCategory::JUICE: category = "JUICE"; break;
  case IngredientCategory::MIXER: category = "MIXER"; break;
  case IngredientCategory::SYRUP: category = "SYRUP"; break;
  case IngredientCategory::OTHER: category = "OTHER"; break;
  }
  cJSON *json = cJSON_CreateObject();
  if (!json || !cJSON_AddNumberToObject(json, "id", ingredient.id) ||
      !cJSON_AddStringToObject(json, "name", ingredient.name.c_str()) ||
      !cJSON_AddStringToObject(json, "category", category)) {
    cJSON_Delete(json);
    return nullptr;
  }
  return json;
}

bool readIngredientCategory(const cJSON *value, IngredientCategory &category) {
  if (!cJSON_IsString(value) || !value->valuestring) return false;
  const std::string name = value->valuestring;
  if (name == "ALCOHOL") category = IngredientCategory::ALCOHOL;
  else if (name == "JUICE") category = IngredientCategory::JUICE;
  else if (name == "MIXER") category = IngredientCategory::MIXER;
  else if (name == "SYRUP") category = IngredientCategory::SYRUP;
  else if (name == "OTHER") category = IngredientCategory::OTHER;
  else return false;
  return true;
}

cJSON *recipeJson(const RecipeConfig &recipe,
                  const RecipeAvailability &availability,
                  bool strengthAdjustmentAvailable) {
  cJSON *json = cJSON_CreateObject();
  cJSON *items = cJSON_CreateArray();
  cJSON *steps = cJSON_CreateArray();
  if (!json || !items || !cJSON_AddNumberToObject(json, "id", recipe.id) ||
      !steps || !cJSON_AddStringToObject(json, "name", recipe.name.c_str()) ||
      !cJSON_AddNumberToObject(json, "baseSizeMl", recipe.baseSizeMl) ||
      !cJSON_AddBoolToObject(json, "strengthAdjustmentAvailable",
                            strengthAdjustmentAvailable)) {
    cJSON_Delete(json);
    cJSON_Delete(items);
    cJSON_Delete(steps);
    return nullptr;
  }

  if (recipe.imageKey) {
    if (!cJSON_AddStringToObject(json, "imageKey", recipe.imageKey->c_str())) {
      cJSON_Delete(items);
      cJSON_Delete(steps);
      cJSON_Delete(json);
      return nullptr;
    }
  } else if (!cJSON_AddNullToObject(json, "imageKey")) {
    cJSON_Delete(items);
    cJSON_Delete(steps);
    cJSON_Delete(json);
    return nullptr;
  }

  const auto addOptionalString = [json](
                                     const char *key,
                                     const std::optional<std::string> &value) {
    return value ? cJSON_AddStringToObject(json, key, value->c_str()) != nullptr
                 : cJSON_AddNullToObject(json, key) != nullptr;
  };
  if (!addOptionalString("subtitle", recipe.subtitle) ||
      !addOptionalString("description", recipe.description)) {
    cJSON_Delete(items);
    cJSON_Delete(steps);
    cJSON_Delete(json);
    return nullptr;
  }

  for (const PreparationStep &step : recipe.preparationSteps) {
    cJSON *stepJson = cJSON_CreateObject();
    if (!stepJson ||
        !cJSON_AddStringToObject(
            stepJson, "phase",
            step.phase == PreparationPhase::BEFORE ? "BEFORE" : "AFTER") ||
        !cJSON_AddStringToObject(stepJson, "text", step.text.c_str()) ||
        !cJSON_AddItemToArray(steps, stepJson)) {
      cJSON_Delete(stepJson);
      cJSON_Delete(items);
      cJSON_Delete(steps);
      cJSON_Delete(json);
      return nullptr;
    }
  }

  for (const RecipeItem &item : recipe.items) {
    cJSON *itemJson = cJSON_CreateObject();
    if (!itemJson ||
        !cJSON_AddNumberToObject(itemJson, "ingredientId", item.ingredientId) ||
        !cJSON_AddNumberToObject(itemJson, "amountMl", item.amountMl) ||
        !cJSON_AddItemToArray(items, itemJson)) {
      cJSON_Delete(itemJson);
      cJSON_Delete(items);
      cJSON_Delete(steps);
      cJSON_Delete(json);
      return nullptr;
    }
  }

  cJSON_AddItemToObject(json, "preparationSteps", steps);
  cJSON_AddItemToObject(json, "items", items);

  cJSON *availabilityJson = cJSON_CreateObject();
  cJSON *missing = cJSON_CreateArray();
  cJSON *uncalibrated = cJSON_CreateArray();
  if (!availabilityJson || !missing || !uncalibrated ||
      !cJSON_AddBoolToObject(availabilityJson, "available",
                            availability.available)) {
    cJSON_Delete(availabilityJson);
    cJSON_Delete(missing);
    cJSON_Delete(uncalibrated);
    cJSON_Delete(json);
    return nullptr;
  }
  for (std::uint16_t id : availability.missingIngredientIds) {
    cJSON_AddItemToArray(missing, cJSON_CreateNumber(id));
  }
  for (std::uint16_t id : availability.uncalibratedIngredientIds) {
    cJSON_AddItemToArray(uncalibrated, cJSON_CreateNumber(id));
  }
  cJSON_AddItemToObject(availabilityJson, "missingIngredientIds", missing);
  cJSON_AddItemToObject(availabilityJson, "uncalibratedIngredientIds",
                       uncalibrated);
  cJSON_AddItemToObject(json, "availability", availabilityJson);
  return json;
}

cJSON *pumpJson(const PumpConfig &pump) {
  cJSON *json = cJSON_CreateObject();
  cJSON *output = cJSON_CreateObject();
  if (!json || !output || !cJSON_AddNumberToObject(json, "id", pump.id)) {
    cJSON_Delete(json);
    cJSON_Delete(output);
    return nullptr;
  }

  if (pump.ingredientId) {
    cJSON_AddNumberToObject(json, "ingredientId", *pump.ingredientId);
  } else {
    cJSON_AddNullToObject(json, "ingredientId");
  }
  if (pump.mlPerSec) {
    cJSON_AddNumberToObject(json, "mlPerSec", *pump.mlPerSec);
  } else {
    cJSON_AddNullToObject(json, "mlPerSec");
  }

  if (!cJSON_AddNumberToObject(
          output, "type", static_cast<std::uint8_t>(pump.outputConfig.type)) ||
      !cJSON_AddNumberToObject(output, "channel", pump.outputConfig.channel)) {
    cJSON_Delete(output);
    cJSON_Delete(json);
    return nullptr;
  }
  cJSON_AddItemToObject(json, "output", output);
  return json;
}

cJSON *bottleJson(const BottleState &bottle) {
  cJSON *json = cJSON_CreateObject();
  if (!json || !cJSON_AddNumberToObject(json, "pumpId", bottle.pumpId) ||
      !cJSON_AddNumberToObject(json, "capacityMl", bottle.capacityMl) ||
      !cJSON_AddNumberToObject(json, "remainingMl", bottle.remainingMl)) {
    cJSON_Delete(json);
    return nullptr;
  }
  return json;
}

cJSON *systemStatusJson(const SystemStatus &status) {
  cJSON *root = cJSON_CreateObject();
  cJSON *memory = cJSON_CreateObject();
  cJSON *cpu = cJSON_CreateObject();
  cJSON *storage = cJSON_CreateObject();
  cJSON *network = cJSON_CreateObject();
  if (!root || !memory || !cpu || !storage || !network) {
    cJSON_Delete(root);
    cJSON_Delete(memory);
    cJSON_Delete(cpu);
    cJSON_Delete(storage);
    cJSON_Delete(network);
    return nullptr;
  }
  cJSON_AddNumberToObject(root, "uptimeMs", status.uptimeMs);
  cJSON_AddNumberToObject(memory, "freeHeapBytes", status.freeHeapBytes);
  cJSON_AddNumberToObject(memory, "minimumFreeHeapBytes",
                         status.minimumFreeHeapBytes);
  cJSON_AddNumberToObject(memory, "largestFreeBlockBytes",
                         status.largestFreeBlockBytes);
  cJSON_AddNumberToObject(cpu, "utilizationPercent",
                         status.cpuUtilizationPercent);
  const auto addStorage = [storage](const char *name,
                                    const StorageUsage &usage) {
    cJSON *value = cJSON_CreateObject();
    if (!value) return false;
    cJSON_AddNumberToObject(value, "totalBytes", usage.totalBytes);
    cJSON_AddNumberToObject(value, "usedBytes", usage.usedBytes);
    cJSON_AddItemToObject(storage, name, value);
    return true;
  };
  if (!addStorage("firmware", status.firmware) ||
      !addStorage("frontend", status.webStorage) ||
      !addStorage("configuration", status.configurationStorage) ||
      !addStorage("media", status.mediaStorage)) {
    cJSON_Delete(root);
    cJSON_Delete(memory);
    cJSON_Delete(cpu);
    cJSON_Delete(storage);
    cJSON_Delete(network);
    return nullptr;
  }
  cJSON_AddStringToObject(network, "mode", status.wifiMode.c_str());
  cJSON_AddBoolToObject(network, "stationConnected",
                       status.stationConnected);
  if (status.stationConnected) cJSON_AddNumberToObject(network, "rssi", status.rssi);
  else cJSON_AddNullToObject(network, "rssi");
  cJSON_AddBoolToObject(network, "accessPointActive",
                       status.accessPointActive);
  cJSON_AddItemToObject(root, "memory", memory);
  cJSON_AddItemToObject(root, "cpu", cpu);
  cJSON_AddItemToObject(root, "storage", storage);
  cJSON_AddItemToObject(root, "network", network);
  return root;
}

bool readRecipeFields(const cJSON *json, std::string &name,
                      std::optional<std::string> &imageKey,
                      std::optional<std::string> &subtitle,
                      std::optional<std::string> &description,
                      std::uint16_t &baseSizeMl,
                      std::vector<PreparationStep> &preparationSteps,
                      std::vector<RecipeItem> &items) {
  const cJSON *nameJson = cJSON_GetObjectItemCaseSensitive(json, "name");
  const cJSON *imageKeyJson =
      cJSON_GetObjectItemCaseSensitive(json, "imageKey");
  const cJSON *itemsJson = cJSON_GetObjectItemCaseSensitive(json, "items");
  const cJSON *subtitleJson =
      cJSON_GetObjectItemCaseSensitive(json, "subtitle");
  const cJSON *descriptionJson =
      cJSON_GetObjectItemCaseSensitive(json, "description");
  const cJSON *baseSizeJson =
      cJSON_GetObjectItemCaseSensitive(json, "baseSizeMl");
  const cJSON *stepsJson =
      cJSON_GetObjectItemCaseSensitive(json, "preparationSteps");
  if (!cJSON_IsString(nameJson) || nameJson->valuestring == nullptr ||
      nameJson->valuestring[0] == '\0' || !cJSON_IsArray(itemsJson) ||
      !readUnsigned(baseSizeJson, baseSizeMl) || baseSizeMl == 0 ||
      !cJSON_IsArray(stepsJson)) {
    return false;
  }

  name = nameJson->valuestring;
  imageKey.reset();
  if (imageKeyJson && !cJSON_IsNull(imageKeyJson)) {
    if (!cJSON_IsString(imageKeyJson) || !imageKeyJson->valuestring) {
      return false;
    }
    imageKey = imageKeyJson->valuestring;
  }

  const auto readOptionalString = [](const cJSON *value,
                                     std::optional<std::string> &result) {
    result.reset();
    if (!value || cJSON_IsNull(value)) return true;
    if (!cJSON_IsString(value) || !value->valuestring) return false;
    result = value->valuestring;
    return true;
  };
  if (!readOptionalString(subtitleJson, subtitle) ||
      !readOptionalString(descriptionJson, description)) {
    return false;
  }

  preparationSteps.clear();
  cJSON *stepJson = nullptr;
  cJSON_ArrayForEach(stepJson, stepsJson) {
    const cJSON *phase =
        cJSON_GetObjectItemCaseSensitive(stepJson, "phase");
    const cJSON *text = cJSON_GetObjectItemCaseSensitive(stepJson, "text");
    if (!cJSON_IsObject(stepJson) || !cJSON_IsString(phase) ||
        !phase->valuestring || !cJSON_IsString(text) || !text->valuestring ||
        text->valuestring[0] == '\0') {
      return false;
    }
    const std::string phaseName = phase->valuestring;
    if (phaseName != "BEFORE" && phaseName != "AFTER") return false;
    preparationSteps.push_back({
        .phase = phaseName == "BEFORE" ? PreparationPhase::BEFORE
                                       : PreparationPhase::AFTER,
        .text = text->valuestring});
  }
  items.clear();
  cJSON *itemJson = nullptr;
  cJSON_ArrayForEach(itemJson, itemsJson) {
    RecipeItem item{};
    if (!cJSON_IsObject(itemJson) ||
        !readUnsigned(
            cJSON_GetObjectItemCaseSensitive(itemJson, "ingredientId"),
            item.ingredientId) ||
        !readUnsigned(cJSON_GetObjectItemCaseSensitive(itemJson, "amountMl"),
                      item.amountMl)) {
      return false;
    }
    items.push_back(item);
  }
  return true;
}

bool readPumpFields(const cJSON *json, std::uint8_t &id, PumpConfig &pump,
                    bool requireId) {
  if (requireId &&
      !readUnsigned(cJSON_GetObjectItemCaseSensitive(json, "id"), id)) {
    return false;
  }

  const cJSON *ingredient =
      cJSON_GetObjectItemCaseSensitive(json, "ingredientId");
  const cJSON *rate = cJSON_GetObjectItemCaseSensitive(json, "mlPerSec");
  const cJSON *output = cJSON_GetObjectItemCaseSensitive(json, "output");
  std::uint8_t type = 0;
  std::uint8_t channel = 0;
  if (!cJSON_IsObject(output) ||
      !readUnsigned(cJSON_GetObjectItemCaseSensitive(output, "type"), type) ||
      type != static_cast<std::uint8_t>(OutputChannelType::GPIO) ||
      !readUnsigned(cJSON_GetObjectItemCaseSensitive(output, "channel"),
                    channel)) {
    return false;
  }

  std::optional<std::uint16_t> ingredientId;
  if (ingredient && !cJSON_IsNull(ingredient)) {
    std::uint16_t value = 0;
    if (!readUnsigned(ingredient, value)) {
      return false;
    }
    ingredientId = value;
  }

  std::optional<float> mlPerSec;
  if (rate && !cJSON_IsNull(rate)) {
    if (!cJSON_IsNumber(rate) || !std::isfinite(rate->valuedouble) ||
        rate->valuedouble <= 0) {
      return false;
    }
    mlPerSec = static_cast<float>(rate->valuedouble);
  }

  pump = {
      .id = id,
      .ingredientId = ingredientId,
      .mlPerSec = mlPerSec,
      .outputConfig = {.type = OutputChannelType::GPIO, .channel = channel}};
  return true;
}

} // namespace

API::API(MachineLogic &machineLogic, PumpControl &pumpControl,
         WiFiController &wifiController,
         RecipeConfigRepository &recipeRepository,
         IngredientConfigRepository &ingredientRepository,
         PumpConfigRepository &pumpRepository,
         BottleStateRepository &bottleStateRepository,
         MediaStorage &mediaStorage, SystemMonitor &systemMonitor,
         DeveloperControl &developerControl)
    : machineLogic_(machineLogic), pumpControl_(pumpControl),
      wifiController_(wifiController), recipeRepository_(recipeRepository),
      ingredientRepository_(ingredientRepository),
      pumpRepository_(pumpRepository),
      bottleStateRepository_(bottleStateRepository), mediaStorage_(mediaStorage),
      systemMonitor_(systemMonitor), developerControl_(developerControl) {}

esp_err_t API::start() {
  esp_err_t result = mountWebFileSystem();
  if (result != ESP_OK) {
    return result;
  }

  systemMonitor_.setUpdateCallback(
      [this](const SystemStatus &status) { handleSystemStatus(status); });

  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.uri_match_fn = httpd_uri_match_wildcard;
  config.max_uri_handlers = 48;

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

  machineLogic_.setEventCallback(
      [this](MachineEvent event, std::optional<std::uint8_t> pumpId) {
        handleMachineEvent(event, pumpId);
      });

  return ESP_OK;
}

void API::stop() {
  wifiController_.setScanFinishedCallback({});
  machineLogic_.setEventCallback({});
  systemMonitor_.setUpdateCallback({});

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
  // Exact collection routes are registered before wildcard item routes. This
  // keeps /api/recipes and /api/recipes/{id} easy to distinguish.
  using RouteHandler = esp_err_t (*)(httpd_req_t *);
  const auto addRoute = [this](const char *uri, httpd_method_t method,
                               RouteHandler handler) {
    httpd_uri_t route = {};
    route.uri = uri;
    route.method = method;
    route.handler = handler;
    route.user_ctx = this;
    return httpd_register_uri_handler(server_, &route);
  };

  struct RouteDefinition {
    const char *uri;
    httpd_method_t method;
    RouteHandler handler;
  };

  const std::array routes = {
      RouteDefinition{"/api/health", HTTP_GET, &API::healthHandler},
      RouteDefinition{"/api/status", HTTP_GET, &API::statusHandler},
      RouteDefinition{"/api/recipes", HTTP_GET, &API::recipesHandler},
      RouteDefinition{"/api/recipes", HTTP_POST, &API::recipesHandler},
      RouteDefinition{"/api/recipes/*", HTTP_GET, &API::recipesHandler},
      RouteDefinition{"/api/recipes/*", HTTP_POST, &API::recipesHandler},
      RouteDefinition{"/api/recipes/*", HTTP_PUT, &API::recipesHandler},
      RouteDefinition{"/api/recipes/*", HTTP_DELETE, &API::recipesHandler},
      RouteDefinition{"/api/ingredients", HTTP_GET, &API::ingredientsHandler},
      RouteDefinition{"/api/ingredients", HTTP_POST, &API::ingredientsHandler},
      RouteDefinition{"/api/ingredients/*", HTTP_GET, &API::ingredientsHandler},
      RouteDefinition{"/api/ingredients/*", HTTP_PUT, &API::ingredientsHandler},
      RouteDefinition{"/api/ingredients/*", HTTP_DELETE,
                      &API::ingredientsHandler},
      RouteDefinition{"/api/pumps", HTTP_GET, &API::pumpsHandler},
      RouteDefinition{"/api/pumps", HTTP_POST, &API::pumpsHandler},
      RouteDefinition{"/api/pumps/*", HTTP_GET, &API::pumpsHandler},
      RouteDefinition{"/api/pumps/*", HTTP_PUT, &API::pumpsHandler},
      RouteDefinition{"/api/pumps/*", HTTP_DELETE, &API::pumpsHandler},
      RouteDefinition{"/api/cleaning/*", HTTP_POST, &API::cleaningHandler},
      RouteDefinition{"/api/calibration/*", HTTP_POST,
                      &API::calibrationHandler},
      RouteDefinition{"/api/operation/*", HTTP_POST, &API::operationHandler},
      RouteDefinition{"/api/network/status", HTTP_GET, &API::networkHandler},
      RouteDefinition{"/api/network/scan", HTTP_POST, &API::networkHandler},
      RouteDefinition{"/api/network/connect", HTTP_POST, &API::networkHandler},
      RouteDefinition{"/api/network/disconnect", HTTP_POST,
                      &API::networkHandler},
      RouteDefinition{"/api/network/reconnect", HTTP_POST,
                      &API::networkHandler},
      RouteDefinition{"/api/network/connection", HTTP_DELETE,
                      &API::networkHandler},
      RouteDefinition{"/api/device", HTTP_GET, &API::deviceHandler},
      RouteDefinition{"/api/device/restart", HTTP_POST, &API::deviceHandler},
      RouteDefinition{"/api/settings/device", HTTP_GET,
                      &API::deviceSettingsHandler},
      RouteDefinition{"/api/settings/device", HTTP_PUT,
                      &API::deviceSettingsHandler},
      RouteDefinition{"/api/bottles", HTTP_GET, &API::bottlesHandler},
      RouteDefinition{"/api/bottles/*", HTTP_GET, &API::bottlesHandler},
      RouteDefinition{"/api/bottles/*", HTTP_PUT, &API::bottlesHandler},
      RouteDefinition{"/api/media/images", HTTP_POST, &API::mediaHandler},
      RouteDefinition{"/api/media/images/*", HTTP_GET, &API::mediaHandler},
      RouteDefinition{"/api/media/images/*", HTTP_DELETE, &API::mediaHandler},
      RouteDefinition{"/api/system/status", HTTP_GET, &API::systemHandler},
      RouteDefinition{"/api/developer/status", HTTP_GET,
                      &API::developerHandler},
      RouteDefinition{"/api/developer/pumps/*", HTTP_POST,
                      &API::developerHandler},
      RouteDefinition{"/api/developer/leds/*", HTTP_PUT,
                      &API::developerHandler},
      RouteDefinition{"/api/developer/leds/reset", HTTP_POST,
                      &API::developerHandler},
      RouteDefinition{"/api/developer/buzzer/*", HTTP_POST,
                      &API::developerHandler},
  };

  for (const RouteDefinition &route : routes) {
    const esp_err_t result = addRoute(route.uri, route.method, route.handler);
    if (result != ESP_OK) {
      return result;
    }
  }

  httpd_uri_t websocketRoute = {};
  websocketRoute.uri = "/ws";
  websocketRoute.method = HTTP_GET;
  websocketRoute.handler = &API::websocketHandler;
  websocketRoute.user_ctx = this;
  websocketRoute.is_websocket = true;

  esp_err_t result = httpd_register_uri_handler(server_, &websocketRoute);

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

esp_err_t API::statusHandler(httpd_req_t *req) {
  return static_cast<API *>(req->user_ctx)->handleStatus(req);
}

esp_err_t API::handleStatus(httpd_req_t *req) {
  const MachineStatus status = machineLogic_.getStatus();

  const char *stateText = "idle";
  switch (status.state) {
  case MachineOperationState::RUNNING:
    stateText = "running";
    break;
  case MachineOperationState::PAUSED:
    stateText = "paused";
    break;
  case MachineOperationState::FINISHED:
    stateText = "finished";
    break;
  case MachineOperationState::STOPPED:
    stateText = "stopped";
    break;
  case MachineOperationState::IDLE:
    break;
  }

  JsonPtr json(cJSON_CreateObject(), cJSON_Delete);
  if (!json || !cJSON_AddStringToObject(json.get(), "state", stateText) ||
      !cJSON_AddNumberToObject(json.get(), "progress", status.progress) ||
      !cJSON_AddBoolToObject(json.get(), "glassPresent",
                            status.glassPresent)) {
    return sendError(req, "500 Internal Server Error", "json_failed");
  }

  const char *kind = nullptr;
  if (status.kind == MachineOperationKind::DRINK) {
    kind = "drink";
  } else if (status.kind == MachineOperationKind::CLEANING) {
    kind = "cleaning";
  } else if (status.kind == MachineOperationKind::CALIBRATION) {
    kind = "calibration";
  }
  if (kind) {
    cJSON_AddStringToObject(json.get(), "kind", kind);
  }
  if (status.recipeId) {
    cJSON_AddNumberToObject(json.get(), "recipeId", *status.recipeId);
  }
  if (!status.label.empty()) {
    cJSON_AddStringToObject(json.get(), "label", status.label.c_str());
  }
  cJSON *completedIngredients = cJSON_CreateArray();
  if (!completedIngredients) {
    return sendError(req, "500 Internal Server Error", "json_failed");
  }
  for (const std::uint16_t ingredientId : status.completedIngredientIds) {
    cJSON *id = cJSON_CreateNumber(ingredientId);
    if (!id || !cJSON_AddItemToArray(completedIngredients, id)) {
      cJSON_Delete(id);
      cJSON_Delete(completedIngredients);
      return sendError(req, "500 Internal Server Error", "json_failed");
    }
  }
  cJSON_AddItemToObject(json.get(), "completedIngredientIds",
                        completedIngredients);
  return sendJson(req, json.get());
}

esp_err_t API::recipesHandler(httpd_req_t *req) {
  return static_cast<API *>(req->user_ctx)->handleRecipes(req);
}

esp_err_t API::handleRecipes(httpd_req_t *req) {
  const std::string path = requestPath(req);
  const auto serializeRecipe = [this](const RecipeConfig &recipe) {
    return recipeJson(recipe, machineLogic_.getRecipeAvailability(recipe),
                      machineLogic_.isStrengthAdjustmentAvailable(recipe));
  };
  if (path == "/api/recipes") {
    if (req->method == HTTP_GET) {
      JsonPtr array(cJSON_CreateArray(), cJSON_Delete);
      for (const RecipeConfig &recipe : recipeRepository_.loadAll()) {
        cJSON *item = serializeRecipe(recipe);
        if (!item || !cJSON_AddItemToArray(array.get(), item)) {
          cJSON_Delete(item);
          return sendError(req, "500 Internal Server Error", "json_failed");
        }
      }
      return sendJson(req, array.get());
    }

    JsonPtr body = readJsonBody(req);
    std::string name;
    std::optional<std::string> imageKey;
    std::optional<std::string> subtitle;
    std::optional<std::string> description;
    std::uint16_t baseSizeMl = 0;
    std::vector<PreparationStep> preparationSteps;
    std::vector<RecipeItem> items;
    if (!body || !readRecipeFields(body.get(), name, imageKey, subtitle,
                                   description, baseSizeMl, preparationSteps,
                                   items)) {
      return sendError(req, "400 Bad Request", "invalid_recipe");
    }
    const std::optional<RecipeConfig> created =
        recipeRepository_.create(name, items, std::move(imageKey),
                                 std::move(subtitle), std::move(description),
                                 baseSizeMl, std::move(preparationSteps));
    if (!created) {
      return sendError(req, "500 Internal Server Error", "storage_failed");
    }
    JsonPtr json(serializeRecipe(*created), cJSON_Delete);
    return sendJson(req, json.get(), "201 Created");
  }

  std::uint16_t id = 0;
  std::string suffix;
  if (!readIdFromPath(path, "/api/recipes/", id, suffix)) {
    return sendError(req, "400 Bad Request", "invalid_recipe_id");
  }

  if (suffix == "/start" && req->method == HTTP_POST) {
    JsonPtr body = readJsonBody(req);
    if (!body) {
      return sendError(req, "400 Bad Request", "invalid_json");
    }
    const cJSON *overridesJson =
        cJSON_GetObjectItemCaseSensitive(body.get(), "overrides");
    const cJSON *sizeJson =
        cJSON_GetObjectItemCaseSensitive(body.get(), "sizeMl");
    const cJSON *strengthJson =
        cJSON_GetObjectItemCaseSensitive(body.get(), "strength");
    const cJSON *ignoreGlassJson =
        cJSON_GetObjectItemCaseSensitive(body.get(), "ignoreGlass");
    std::uint16_t sizeMl = 0;
    if (!readUnsigned(sizeJson, sizeMl) || sizeMl == 0) {
      return sendError(req, "400 Bad Request", "invalid_size");
    }
    if (!cJSON_IsString(strengthJson) || !strengthJson->valuestring) {
      return sendError(req, "400 Bad Request", "invalid_strength");
    }
    if (overridesJson && !cJSON_IsArray(overridesJson)) {
      return sendError(req, "400 Bad Request", "invalid_overrides");
    }
    if (ignoreGlassJson && !cJSON_IsBool(ignoreGlassJson)) {
      return sendError(req, "400 Bad Request", "invalid_glass_override");
    }
    DrinkStrength strength = DrinkStrength::STANDARD;
    const std::string strengthName = strengthJson->valuestring;
    if (strengthName == "less") {
      strength = DrinkStrength::LESS;
    } else if (strengthName == "more") {
      strength = DrinkStrength::MORE;
    } else if (strengthName != "standard") {
      return sendError(req, "400 Bad Request", "invalid_strength");
    }

    std::vector<RecipeItem> overrides;
    cJSON *itemJson = nullptr;
    cJSON_ArrayForEach(itemJson, overridesJson) {
      RecipeItem item{};
      if (!cJSON_IsObject(itemJson) ||
          !readUnsigned(
              cJSON_GetObjectItemCaseSensitive(itemJson, "ingredientId"),
              item.ingredientId) ||
          !readUnsigned(cJSON_GetObjectItemCaseSensitive(itemJson, "amountMl"),
                        item.amountMl)) {
        return sendError(req, "400 Bad Request", "invalid_overrides");
      }
      overrides.push_back(item);
    }

    const StartRecipeResult result =
        machineLogic_.startRecipe(id, sizeMl, strength, overrides,
                                  cJSON_IsTrue(ignoreGlassJson));
    if (result != StartRecipeResult::SUCCESS) {
      if (result == StartRecipeResult::RECIPE_NOT_FOUND) {
        return sendError(req, "404 Not Found", "recipe_not_found");
      }
      if (result == StartRecipeResult::INGREDIENT_NOT_AVAILABLE) {
        return sendError(req, "409 Conflict", "ingredient_not_available");
      }
      if (result == StartRecipeResult::PUMP_NOT_CALIBRATED) {
        return sendError(req, "409 Conflict", "pump_not_calibrated");
      }
      if (result == StartRecipeResult::INVALID_OVERRIDE) {
        return sendError(req, "400 Bad Request", "invalid_overrides");
      }
      if (result == StartRecipeResult::INVALID_SIZE) {
        return sendError(req, "400 Bad Request", "invalid_size");
      }
      if (result == StartRecipeResult::STRENGTH_NOT_SUPPORTED) {
        return sendError(req, "409 Conflict", "strength_not_supported");
      }
      if (result == StartRecipeResult::MACHINE_BUSY) {
        return sendError(req, "409 Conflict", "machine_busy");
      }
      if (result == StartRecipeResult::NO_GLASS) {
        return sendError(req, "409 Conflict", "no_glass");
      }
      return sendError(req, "500 Internal Server Error", "start_failed");
    }
    return sendNoContent(req);
  }

  if (!suffix.empty()) {
    return sendError(req, "404 Not Found", "route_not_found");
  }
  const std::optional<RecipeConfig> existing = recipeRepository_.findById(id);
  if (!existing) {
    return sendError(req, "404 Not Found", "recipe_not_found");
  }
  if (req->method == HTTP_GET) {
    JsonPtr json(serializeRecipe(*existing), cJSON_Delete);
    return sendJson(req, json.get());
  }
  if (req->method == HTTP_DELETE) {
    return recipeRepository_.remove(id)
               ? sendNoContent(req)
               : sendError(req, "500 Internal Server Error", "storage_failed");
  }

  JsonPtr body = readJsonBody(req);
  RecipeConfig updated{.id = id,
                       .name = {},
                       .imageKey = {},
                       .subtitle = {},
                       .description = {},
                       .baseSizeMl = 0,
                       .preparationSteps = {},
                       .items = {}};
  if (!body || !readRecipeFields(body.get(), updated.name, updated.imageKey,
                                 updated.subtitle, updated.description,
                                 updated.baseSizeMl, updated.preparationSteps,
                                 updated.items)) {
    return sendError(req, "400 Bad Request", "invalid_recipe");
  }
  return recipeRepository_.update(updated)
             ? sendNoContent(req)
             : sendError(req, "500 Internal Server Error", "storage_failed");
}

esp_err_t API::ingredientsHandler(httpd_req_t *req) {
  return static_cast<API *>(req->user_ctx)->handleIngredients(req);
}

esp_err_t API::handleIngredients(httpd_req_t *req) {
  const std::string path = requestPath(req);
  if (path == "/api/ingredients") {
    if (req->method == HTTP_GET) {
      JsonPtr array(cJSON_CreateArray(), cJSON_Delete);
      for (const IngredientConfig &ingredient :
           ingredientRepository_.loadAll()) {
        cJSON *item = ingredientJson(ingredient);
        if (!item || !cJSON_AddItemToArray(array.get(), item)) {
          cJSON_Delete(item);
          return sendError(req, "500 Internal Server Error", "json_failed");
        }
      }
      return sendJson(req, array.get());
    }

    JsonPtr body = readJsonBody(req);
    const cJSON *name =
        body ? cJSON_GetObjectItemCaseSensitive(body.get(), "name") : nullptr;
    const cJSON *categoryJson = body
        ? cJSON_GetObjectItemCaseSensitive(body.get(), "category") : nullptr;
    IngredientCategory category = IngredientCategory::OTHER;
    if (!cJSON_IsString(name) || !name->valuestring || !name->valuestring[0] ||
        !readIngredientCategory(categoryJson, category)) {
      return sendError(req, "400 Bad Request", "invalid_ingredient");
    }
    const std::optional<IngredientConfig> created =
        ingredientRepository_.create(name->valuestring, category);
    if (!created) {
      return sendError(req, "409 Conflict", "ingredient_not_created");
    }
    JsonPtr json(ingredientJson(*created), cJSON_Delete);
    return sendJson(req, json.get(), "201 Created");
  }

  std::uint16_t id = 0;
  std::string suffix;
  if (!readIdFromPath(path, "/api/ingredients/", id, suffix) ||
      !suffix.empty()) {
    return sendError(req, "400 Bad Request", "invalid_ingredient_id");
  }
  const std::optional<IngredientConfig> existing =
      ingredientRepository_.findById(id);
  if (!existing) {
    return sendError(req, "404 Not Found", "ingredient_not_found");
  }
  if (req->method == HTTP_GET) {
    JsonPtr json(ingredientJson(*existing), cJSON_Delete);
    return sendJson(req, json.get());
  }
  if (req->method == HTTP_DELETE) {
    return ingredientRepository_.remove(id)
               ? sendNoContent(req)
               : sendError(req, "500 Internal Server Error", "storage_failed");
  }

  JsonPtr body = readJsonBody(req);
  const cJSON *name =
      body ? cJSON_GetObjectItemCaseSensitive(body.get(), "name") : nullptr;
  const cJSON *categoryJson = body
      ? cJSON_GetObjectItemCaseSensitive(body.get(), "category") : nullptr;
  IngredientCategory category = IngredientCategory::OTHER;
  if (!cJSON_IsString(name) || !name->valuestring || !name->valuestring[0] ||
      !readIngredientCategory(categoryJson, category)) {
    return sendError(req, "400 Bad Request", "invalid_ingredient");
  }
  const IngredientConfig updated{
      .id = id, .name = name->valuestring, .category = category};
  return ingredientRepository_.update(updated)
             ? sendNoContent(req)
             : sendError(req, "409 Conflict", "ingredient_not_updated");
}

esp_err_t API::pumpsHandler(httpd_req_t *req) {
  return static_cast<API *>(req->user_ctx)->handlePumps(req);
}

esp_err_t API::handlePumps(httpd_req_t *req) {
  const std::string path = requestPath(req);
  if (path == "/api/pumps") {
    if (req->method == HTTP_GET) {
      JsonPtr array(cJSON_CreateArray(), cJSON_Delete);
      for (const PumpConfig &pump : pumpRepository_.loadAll()) {
        cJSON *item = pumpJson(pump);
        if (!item || !cJSON_AddItemToArray(array.get(), item)) {
          cJSON_Delete(item);
          return sendError(req, "500 Internal Server Error", "json_failed");
        }
      }
      return sendJson(req, array.get());
    }

    JsonPtr body = readJsonBody(req);
    std::uint8_t id = 0;
    PumpConfig pump{};
    if (!body || !readPumpFields(body.get(), id, pump, true)) {
      return sendError(req, "400 Bad Request", "invalid_pump");
    }
    if (!pumpRepository_.add(pump)) {
      return sendError(req, "409 Conflict", "pump_not_created");
    }
    if (pumpControl_.addPump(pump) != PumpResult::SUCCESS) {
      pumpRepository_.remove(id);
      return sendError(req, "500 Internal Server Error",
                       "runtime_update_failed");
    }
    JsonPtr json(pumpJson(pump), cJSON_Delete);
    return sendJson(req, json.get(), "201 Created");
  }

  std::uint8_t id = 0;
  std::string suffix;
  if (!readIdFromPath(path, "/api/pumps/", id, suffix)) {
    return sendError(req, "400 Bad Request", "invalid_pump_id");
  }
  const std::optional<PumpConfig> existing = pumpRepository_.findById(id);
  if (!existing) {
    return sendError(req, "404 Not Found", "pump_not_found");
  }

  if (suffix == "/ingredient" && req->method == HTTP_PUT) {
    JsonPtr body = readJsonBody(req);
    const cJSON *ingredient =
        body ? cJSON_GetObjectItemCaseSensitive(body.get(), "ingredientId")
             : nullptr;
    std::optional<std::uint16_t> ingredientId;
    if (ingredient && !cJSON_IsNull(ingredient)) {
      std::uint16_t value = 0;
      if (!readUnsigned(ingredient, value)) {
        return sendError(req, "400 Bad Request", "invalid_ingredient_id");
      }
      ingredientId = value;
    } else if (!ingredient) {
      return sendError(req, "400 Bad Request", "ingredient_id_required");
    }

    PumpConfig updated = *existing;
    updated.ingredientId = ingredientId;
    if (!pumpRepository_.update(updated)) {
      return sendError(req, "500 Internal Server Error", "storage_failed");
    }
    if (pumpControl_.setPumpIngredient(id, ingredientId) !=
        PumpResult::SUCCESS) {
      pumpRepository_.update(*existing);
      return sendError(req, "500 Internal Server Error",
                       "runtime_update_failed");
    }
    return sendNoContent(req);
  }

  if (!suffix.empty()) {
    return sendError(req, "404 Not Found", "route_not_found");
  }
  if (req->method == HTTP_GET) {
    JsonPtr json(pumpJson(*existing), cJSON_Delete);
    return sendJson(req, json.get());
  }
  if (req->method == HTTP_DELETE) {
    if (!pumpRepository_.remove(id)) {
      return sendError(req, "500 Internal Server Error", "storage_failed");
    }
    if (pumpControl_.deletePump(id) != PumpResult::SUCCESS) {
      pumpRepository_.add(*existing);
      return sendError(req, "500 Internal Server Error",
                       "runtime_update_failed");
    }
    return sendNoContent(req);
  }

  JsonPtr body = readJsonBody(req);
  PumpConfig updated{};
  if (!body || !readPumpFields(body.get(), id, updated, false)) {
    return sendError(req, "400 Bad Request", "invalid_pump");
  }
  if (!pumpRepository_.update(updated)) {
    return sendError(req, "500 Internal Server Error", "storage_failed");
  }
  if (pumpControl_.updatePump(updated) != PumpResult::SUCCESS) {
    pumpRepository_.update(*existing);
    return sendError(req, "500 Internal Server Error", "runtime_update_failed");
  }
  return sendNoContent(req);
}

esp_err_t API::cleaningHandler(httpd_req_t *req) {
  return static_cast<API *>(req->user_ctx)->handleCleaning(req);
}

esp_err_t API::handleCleaning(httpd_req_t *req) {
  const std::string path = requestPath(req);
  MachineActionResult result = MachineActionResult::START_FAILED;
  if (path == "/api/cleaning/start") {
    result = machineLogic_.startCleaningAllPumps();
  } else {
    std::uint8_t pumpId = 0;
    std::string suffix;
    if (!readIdFromPath(path, "/api/cleaning/pumps/", pumpId, suffix) ||
        suffix != "/start") {
      return sendError(req, "404 Not Found", "route_not_found");
    }
    result = machineLogic_.startCleaningPump(pumpId);
    if (result == MachineActionResult::PUMP_NOT_FOUND) {
      return sendError(req, "404 Not Found", "pump_not_found");
    }
  }

  if (result == MachineActionResult::SUCCESS) {
    return sendNoContent(req);
  }
  if (result == MachineActionResult::MACHINE_BUSY) {
    return sendError(req, "409 Conflict", "machine_busy");
  }
  if (result == MachineActionResult::PUMP_NOT_FOUND) {
    return sendError(req, "409 Conflict", "no_pumps_configured");
  }
  return sendError(req, "500 Internal Server Error", "cleaning_start_failed");
}

esp_err_t API::calibrationHandler(httpd_req_t *req) {
  return static_cast<API *>(req->user_ctx)->handleCalibration(req);
}

esp_err_t API::handleCalibration(httpd_req_t *req) {
  const std::string path = requestPath(req);
  JsonPtr body = readJsonBody(req);
  if (!body) {
    return sendError(req, "400 Bad Request", "invalid_json");
  }

  if (path == "/api/calibration/start") {
    std::uint8_t pumpId = 0;
    std::uint64_t durationMs = 0;
    if (!readUnsigned(cJSON_GetObjectItemCaseSensitive(body.get(), "pumpId"),
                      pumpId) ||
        !readUnsigned(
            cJSON_GetObjectItemCaseSensitive(body.get(), "durationMs"),
            durationMs)) {
      return sendError(req, "400 Bad Request", "invalid_calibration");
    }
    const MachineActionResult result =
        machineLogic_.startCalibrationPump(pumpId, durationMs);
    if (result == MachineActionResult::SUCCESS) {
      return sendNoContent(req);
    }
    if (result == MachineActionResult::INVALID_AMOUNT) {
      return sendError(req, "400 Bad Request", "invalid_calibration");
    }
    if (result == MachineActionResult::PUMP_NOT_FOUND) {
      return sendError(req, "404 Not Found", "pump_not_found");
    }
    if (result == MachineActionResult::MACHINE_BUSY) {
      return sendError(req, "409 Conflict", "machine_busy");
    }
    return sendError(req, "500 Internal Server Error",
                     "calibration_start_failed");
  }

  if (path != "/api/calibration/finish") {
    return sendError(req, "404 Not Found", "route_not_found");
  }

  std::uint64_t measuredMl = 0;
  if (!readUnsigned(cJSON_GetObjectItemCaseSensitive(body.get(), "measuredMl"),
                    measuredMl)) {
    return sendError(req, "400 Bad Request", "invalid_measurement");
  }
  const MachineActionResult result =
      machineLogic_.finishedCalibrationPump(measuredMl);
  if (result == MachineActionResult::SUCCESS) {
    return sendNoContent(req);
  }
  if (result == MachineActionResult::INVALID_AMOUNT) {
    return sendError(req, "400 Bad Request", "invalid_measurement");
  }
  if (result == MachineActionResult::PUMP_NOT_FOUND) {
    return sendError(req, "404 Not Found", "pump_not_found");
  }
  if (result == MachineActionResult::OPERATION_NOT_READY) {
    return sendError(req, "409 Conflict", "calibration_not_ready");
  }
  return sendError(req, "500 Internal Server Error", "calibration_save_failed");
}

esp_err_t API::operationHandler(httpd_req_t *req) {
  return static_cast<API *>(req->user_ctx)->handleOperation(req);
}

esp_err_t API::handleOperation(httpd_req_t *req) {
  const std::string path = requestPath(req);
  if (path == "/api/operation/stop") {
    machineLogic_.stopCurrentOperation();
    return sendNoContent(req);
  }
  if (path == "/api/operation/resume") {
    JsonPtr body = readJsonBody(req);
    const cJSON *ignoreGlass = body
        ? cJSON_GetObjectItemCaseSensitive(body.get(), "ignoreGlass")
        : nullptr;
    if (ignoreGlass && !cJSON_IsBool(ignoreGlass)) {
      return sendError(req, "400 Bad Request", "invalid_glass_override");
    }
    const MachineActionResult result =
        machineLogic_.resumeCurrentOperation(cJSON_IsTrue(ignoreGlass));
    if (result == MachineActionResult::SUCCESS) {
      return sendNoContent(req);
    }
    if (result == MachineActionResult::GLASS_NOT_PRESENT) {
      return sendError(req, "409 Conflict", "no_glass");
    }
    if (result == MachineActionResult::OPERATION_NOT_READY) {
      return sendError(req, "409 Conflict", "operation_not_paused");
    }
    return sendError(req, "500 Internal Server Error", "resume_failed");
  }
  return sendError(req, "404 Not Found", "route_not_found");
}

esp_err_t API::deviceSettingsHandler(httpd_req_t *req) {
  return static_cast<API *>(req->user_ctx)->handleDeviceSettings(req);
}

esp_err_t API::handleDeviceSettings(httpd_req_t *req) {
  if (requestPath(req) != "/api/settings/device") {
    return sendError(req, "404 Not Found", "route_not_found");
  }

  if (req->method == HTTP_GET) {
    const DeviceSettings settings = machineLogic_.getDeviceSettings();
    JsonPtr json(cJSON_CreateObject(), cJSON_Delete);
    cJSON *sizes = cJSON_CreateArray();
    if (!json || !cJSON_AddBoolToObject(
                     json.get(), "activateLedWhenPumpActive",
                     settings.activateLedWhenPumpActive) ||
        !cJSON_AddBoolToObject(json.get(), "requireGlassDetection",
                              settings.requireGlassDetection) || !sizes ||
        !cJSON_AddNumberToObject(json.get(), "defaultDrinkSizeMl",
                                settings.defaultDrinkSizeMl) ||
        !cJSON_AddNumberToObject(json.get(), "alcoholStrengthLessFactor",
                                settings.alcoholStrengthLessFactor) ||
        !cJSON_AddNumberToObject(json.get(), "alcoholStrengthMoreFactor",
                                settings.alcoholStrengthMoreFactor)) {
      cJSON_Delete(sizes);
      return sendError(req, "500 Internal Server Error", "json_failed");
    }
    for (const std::uint16_t size : settings.drinkSizesMl) {
      cJSON_AddItemToArray(sizes, cJSON_CreateNumber(size));
    }
    cJSON_AddItemToObject(json.get(), "drinkSizesMl", sizes);
    return sendJson(req, json.get());
  }

  JsonPtr body = readJsonBody(req);
  const cJSON *activateLed =
      body ? cJSON_GetObjectItemCaseSensitive(
                 body.get(), "activateLedWhenPumpActive")
           : nullptr;
  const cJSON *requireGlass = body
      ? cJSON_GetObjectItemCaseSensitive(body.get(), "requireGlassDetection")
      : nullptr;
  const cJSON *sizesJson = body
      ? cJSON_GetObjectItemCaseSensitive(body.get(), "drinkSizesMl") : nullptr;
  const cJSON *defaultSizeJson = body
      ? cJSON_GetObjectItemCaseSensitive(body.get(), "defaultDrinkSizeMl") : nullptr;
  const cJSON *lessJson = body
      ? cJSON_GetObjectItemCaseSensitive(body.get(), "alcoholStrengthLessFactor") : nullptr;
  const cJSON *moreJson = body
      ? cJSON_GetObjectItemCaseSensitive(body.get(), "alcoholStrengthMoreFactor") : nullptr;
  std::uint16_t defaultSize = 0;
  if (!cJSON_IsBool(activateLed) || !cJSON_IsBool(requireGlass) ||
      !cJSON_IsArray(sizesJson) ||
      cJSON_GetArraySize(sizesJson) <= 0 || cJSON_GetArraySize(sizesJson) > 16 ||
      !readUnsigned(defaultSizeJson, defaultSize) ||
      !cJSON_IsNumber(lessJson) || !cJSON_IsNumber(moreJson) ||
      !std::isfinite(lessJson->valuedouble) ||
      !std::isfinite(moreJson->valuedouble)) {
    return sendError(req, "400 Bad Request", "invalid_device_settings");
  }

  std::vector<std::uint16_t> sizes;
  cJSON *sizeJson = nullptr;
  cJSON_ArrayForEach(sizeJson, sizesJson) {
    std::uint16_t size = 0;
    if (!readUnsigned(sizeJson, size) || size == 0) {
      return sendError(req, "400 Bad Request", "invalid_device_settings");
    }
    sizes.push_back(size);
  }
  std::sort(sizes.begin(), sizes.end());
  if (std::adjacent_find(sizes.begin(), sizes.end()) != sizes.end() ||
      std::find(sizes.begin(), sizes.end(), defaultSize) == sizes.end() ||
      lessJson->valuedouble <= 0.0 || lessJson->valuedouble >= 1.0 ||
      moreJson->valuedouble <= 1.0) {
    return sendError(req, "400 Bad Request", "invalid_device_settings");
  }

  const DeviceSettings settings{
      .activateLedWhenPumpActive = cJSON_IsTrue(activateLed) != 0,
      .requireGlassDetection = cJSON_IsTrue(requireGlass) != 0,
      .drinkSizesMl = std::move(sizes),
      .defaultDrinkSizeMl = defaultSize,
      .alcoholStrengthLessFactor = static_cast<float>(lessJson->valuedouble),
      .alcoholStrengthMoreFactor = static_cast<float>(moreJson->valuedouble)};
  return machineLogic_.updateDeviceSettings(settings)
             ? sendNoContent(req)
             : sendError(req, "500 Internal Server Error", "storage_failed");
}

esp_err_t API::bottlesHandler(httpd_req_t *req) {
  return static_cast<API *>(req->user_ctx)->handleBottles(req);
}

esp_err_t API::handleBottles(httpd_req_t *req) {
  const std::string path = requestPath(req);
  if (path == "/api/bottles") {
    JsonPtr array(cJSON_CreateArray(), cJSON_Delete);
    for (const BottleState &bottle : bottleStateRepository_.loadAll()) {
      cJSON *item = bottleJson(bottle);
      if (!item || !cJSON_AddItemToArray(array.get(), item)) {
        cJSON_Delete(item);
        return sendError(req, "500 Internal Server Error", "json_failed");
      }
    }
    return sendJson(req, array.get());
  }

  std::uint8_t pumpId = 0;
  std::string suffix;
  if (!readIdFromPath(path, "/api/bottles/", pumpId, suffix) ||
      !suffix.empty()) {
    return sendError(req, "400 Bad Request", "invalid_pump_id");
  }

  if (req->method == HTTP_GET) {
    const std::optional<BottleState> bottle =
        bottleStateRepository_.findByPumpId(pumpId);
    if (!bottle) {
      return sendError(req, "404 Not Found", "bottle_not_found");
    }
    JsonPtr json(bottleJson(*bottle), cJSON_Delete);
    return sendJson(req, json.get());
  }

  JsonPtr body = readJsonBody(req);
  std::uint16_t capacityMl = 0;
  const cJSON *remainingMl =
      body ? cJSON_GetObjectItemCaseSensitive(body.get(), "remainingMl")
           : nullptr;
  if (!body ||
      !readUnsigned(cJSON_GetObjectItemCaseSensitive(body.get(), "capacityMl"),
                    capacityMl) ||
      !cJSON_IsNumber(remainingMl) ||
      !std::isfinite(remainingMl->valuedouble) ||
      remainingMl->valuedouble > std::numeric_limits<float>::max() ||
      remainingMl->valuedouble < -std::numeric_limits<float>::max()) {
    return sendError(req, "400 Bad Request", "invalid_bottle_state");
  }

  const BottleState bottle{
      .pumpId = pumpId,
      .capacityMl = capacityMl,
      .remainingMl = static_cast<float>(remainingMl->valuedouble)};
  return bottleStateRepository_.update(bottle)
             ? sendNoContent(req)
             : sendError(req, "500 Internal Server Error", "storage_failed");
}

esp_err_t API::mediaHandler(httpd_req_t *req) {
  return static_cast<API *>(req->user_ctx)->handleMedia(req);
}

esp_err_t API::handleMedia(httpd_req_t *req) {
  const std::string path = requestPath(req);
  if (path == "/api/media/images" && req->method == HTTP_POST) {
    if (req->content_len <= 0 ||
        static_cast<std::size_t>(req->content_len) >
            MediaStorage::MAX_IMAGE_BYTES) {
      return sendError(req, "413 Payload Too Large", "image_too_large");
    }
    char contentType[32] = {};
    if (httpd_req_get_hdr_value_str(req, "Content-Type", contentType,
                                    sizeof(contentType)) != ESP_OK ||
        std::string_view(contentType).find("image/webp") != 0) {
      return sendError(req, "415 Unsupported Media Type",
                       "unsupported_image_type");
    }
    const MediaStorageInfo storage = mediaStorage_.info();
    if (!mediaStorage_.ready() ||
        storage.totalBytes - std::min(storage.totalBytes, storage.usedBytes) <
            static_cast<std::size_t>(req->content_len)) {
      return sendError(req, "507 Insufficient Storage", "media_storage_full");
    }
    std::string id;
    do {
      id = mediaStorage_.generateImageId();
    } while (mediaStorage_.imageExists(id));

    const bool stored = mediaStorage_.storeImage(
        id, static_cast<std::size_t>(req->content_len),
        [req](char *buffer, std::size_t size) {
          int received = 0;
          do {
            received = httpd_req_recv(req, buffer, size);
          } while (received == HTTPD_SOCK_ERR_TIMEOUT);
          return received;
        });
    if (!stored) {
      return sendError(req, "507 Insufficient Storage", "media_storage_full");
    }
    JsonPtr json(cJSON_CreateObject(), cJSON_Delete);
    const std::string imageKey = "media:" + id;
    if (!json || !cJSON_AddStringToObject(json.get(), "imageKey",
                                         imageKey.c_str())) {
      mediaStorage_.removeImage(id);
      return sendError(req, "500 Internal Server Error", "json_failed");
    }
    return sendJson(req, json.get(), "201 Created");
  }

  std::string id;
  if (path.starts_with("/api/media/images/")) {
    id = path.substr(std::string_view("/api/media/images/").size());
  }
  if (!MediaStorage::validImageId(id)) {
    return sendError(req, "400 Bad Request", "invalid_image_id");
  }
  if (!mediaStorage_.imageExists(id)) {
    return sendError(req, "404 Not Found", "image_not_found");
  }
  if (req->method == HTTP_GET) {
    httpd_resp_set_hdr(req, "Cache-Control", "public, max-age=31536000, immutable");
    return sendFile(req, mediaStorage_.imagePath(id));
  }

  const std::string imageKey = "media:" + id;
  const std::vector<RecipeConfig> recipes = recipeRepository_.loadAll();
  const bool inUse = std::any_of(
      recipes.begin(), recipes.end(),
      [&imageKey](const RecipeConfig &recipe) {
        return recipe.imageKey && *recipe.imageKey == imageKey;
      });
  if (inUse) {
    return sendError(req, "409 Conflict", "image_in_use");
  }
  return mediaStorage_.removeImage(id)
             ? sendNoContent(req)
             : sendError(req, "500 Internal Server Error", "media_delete_failed");
}

esp_err_t API::systemHandler(httpd_req_t *req) {
  return static_cast<API *>(req->user_ctx)->handleSystem(req);
}

esp_err_t API::handleSystem(httpd_req_t *req) {
  if (requestPath(req) != "/api/system/status") {
    return sendError(req, "404 Not Found", "route_not_found");
  }
  JsonPtr json(systemStatusJson(systemMonitor_.status()), cJSON_Delete);
  return sendJson(req, json.get());
}

void API::handleSystemStatus(const SystemStatus &status) {
  JsonPtr root(cJSON_CreateObject(), cJSON_Delete);
  cJSON *statusJson = systemStatusJson(status);
  if (!root || !statusJson ||
      !cJSON_AddStringToObject(root.get(), "type", "system_status")) {
    cJSON_Delete(statusJson);
    return;
  }
  cJSON_AddItemToObject(root.get(), "status", statusJson);
  JsonStringPtr text(cJSON_PrintUnformatted(root.get()), cJSON_free);
  if (text) sendWebSocketMessage(text.get());
}

esp_err_t API::developerHandler(httpd_req_t *req) {
  return static_cast<API *>(req->user_ctx)->handleDeveloper(req);
}

esp_err_t API::handleDeveloper(httpd_req_t *req) {
  const std::string path = requestPath(req);
  if (path == "/api/developer/status" && req->method == HTTP_GET) {
    const MachineStatus machine = machineLogic_.getStatus();
    const auto stateName = [&machine]() {
      switch (machine.state) {
      case MachineOperationState::RUNNING: return "running";
      case MachineOperationState::PAUSED: return "paused";
      case MachineOperationState::FINISHED: return "finished";
      case MachineOperationState::STOPPED: return "stopped";
      case MachineOperationState::IDLE: return "idle";
      }
      return "idle";
    };
    const char *kind = "none";
    if (machine.kind == MachineOperationKind::DRINK) kind = "drink";
    else if (machine.kind == MachineOperationKind::CLEANING) kind = "cleaning";
    else if (machine.kind == MachineOperationKind::CALIBRATION) kind = "calibration";

    JsonPtr root(cJSON_CreateObject(), cJSON_Delete);
    cJSON *machineJson = cJSON_CreateObject();
    cJSON *pumpsJson = cJSON_CreateArray();
    cJSON *bottlesJson = cJSON_CreateArray();
    if (!root || !machineJson || !pumpsJson || !bottlesJson) {
      cJSON_Delete(machineJson);
      cJSON_Delete(pumpsJson);
      cJSON_Delete(bottlesJson);
      return sendError(req, "500 Internal Server Error", "json_failed");
    }
    cJSON_AddBoolToObject(root.get(), "glassPresent",
                         developerControl_.glassPresent());
    cJSON_AddStringToObject(machineJson, "kind", kind);
    cJSON_AddStringToObject(machineJson, "state", stateName());
    cJSON_AddBoolToObject(
        machineJson, "busy",
        machine.state == MachineOperationState::RUNNING ||
            machine.state == MachineOperationState::PAUSED ||
            (machine.kind == MachineOperationKind::CALIBRATION &&
             machine.state == MachineOperationState::FINISHED));
    cJSON_AddItemToObject(root.get(), "machine", machineJson);
    for (const PumpConfig &pump : pumpRepository_.loadAll()) {
      cJSON *value = pumpJson(pump);
      if (!value) return sendError(req, "500 Internal Server Error", "json_failed");
      cJSON_AddBoolToObject(value, "running",
                           pumpControl_.isPumpRunning(pump.id));
      cJSON_AddItemToArray(pumpsJson, value);
    }
    for (const BottleState &bottle : bottleStateRepository_.loadAll()) {
      cJSON_AddItemToArray(bottlesJson, bottleJson(bottle));
    }
    cJSON_AddItemToObject(root.get(), "pumps", pumpsJson);
    cJSON_AddItemToObject(root.get(), "bottles", bottlesJson);
    return sendJson(req, root.get());
  }

  const auto resultResponse = [req](DeveloperResult result) {
    if (result == DeveloperResult::SUCCESS) return sendNoContent(req);
    if (result == DeveloperResult::MACHINE_BUSY)
      return sendError(req, "409 Conflict", "machine_busy");
    if (result == DeveloperResult::PUMP_NOT_FOUND)
      return sendError(req, "404 Not Found", "pump_not_found");
    return sendError(req, "400 Bad Request", "invalid_duration");
  };

  if (path == "/api/developer/pumps/stop") {
    developerControl_.stopAllPumps();
    return sendNoContent(req);
  }
  std::uint8_t pumpId = 0;
  std::string suffix;
  if (readIdFromPath(path, "/api/developer/pumps/", pumpId, suffix)) {
    if (suffix == "/stop") {
      return resultResponse(developerControl_.stopPump(pumpId));
    }
    if (suffix == "/test") {
      JsonPtr body = readJsonBody(req);
      std::uint32_t durationMs = 0;
      if (!body || !readUnsigned(
                       cJSON_GetObjectItemCaseSensitive(body.get(), "durationMs"),
                       durationMs)) {
        return sendError(req, "400 Bad Request", "invalid_duration");
      }
      return resultResponse(developerControl_.testPump(pumpId, durationMs));
    }
  }

  if (path == "/api/developer/leds/reset") {
    developerControl_.resetPumpLeds();
    return sendNoContent(req);
  }
  if (readIdFromPath(path, "/api/developer/leds/", pumpId, suffix) &&
      suffix.empty()) {
    JsonPtr body = readJsonBody(req);
    const cJSON *state = body
        ? cJSON_GetObjectItemCaseSensitive(body.get(), "state") : nullptr;
    if (!cJSON_IsBool(state)) {
      return sendError(req, "400 Bad Request", "invalid_led_state");
    }
    return developerControl_.setPumpLed(pumpId, cJSON_IsTrue(state))
               ? sendNoContent(req)
               : sendError(req, "404 Not Found", "pump_not_found");
  }

  if (path == "/api/developer/buzzer/stop") {
    developerControl_.stopBuzzer();
    return sendNoContent(req);
  }
  if (path == "/api/developer/buzzer/test") {
    JsonPtr body = readJsonBody(req);
    const cJSON *melody = body
        ? cJSON_GetObjectItemCaseSensitive(body.get(), "melody") : nullptr;
    if (!cJSON_IsString(melody) || !melody->valuestring) {
      return sendError(req, "400 Bad Request", "invalid_melody");
    }
    const std::string value = melody->valuestring;
    if (value == "success") developerControl_.playSuccess();
    else if (value == "error") developerControl_.playError();
    else return sendError(req, "400 Bad Request", "invalid_melody");
    return sendNoContent(req);
  }
  return sendError(req, "404 Not Found", "route_not_found");
}

esp_err_t API::networkHandler(httpd_req_t *req) {
  return static_cast<API *>(req->user_ctx)->handleNetwork(req);
}

esp_err_t API::handleNetwork(httpd_req_t *req) {
  const std::string path = requestPath(req);
  if (path == "/api/network/scan") {
    return handleNetworkScan(req);
  }
  if (path == "/api/network/connect") {
    JsonPtr body = readJsonBody(req);
    const cJSON *ssid =
        body ? cJSON_GetObjectItemCaseSensitive(body.get(), "ssid") : nullptr;
    const cJSON *password =
        body ? cJSON_GetObjectItemCaseSensitive(body.get(), "password")
             : nullptr;
    if (!cJSON_IsString(ssid) || !ssid->valuestring || !ssid->valuestring[0] ||
        !cJSON_IsString(password) || !password->valuestring) {
      return sendError(req, "400 Bad Request", "invalid_network");
    }
    const esp_err_t result =
        wifiController_.connect(ssid->valuestring, password->valuestring);
    return result == ESP_OK
               ? sendNoContent(req)
               : sendError(req, "500 Internal Server Error", "connect_failed");
  }
  if (path == "/api/network/connection") {
    return wifiController_.forgetNetwork() == ESP_OK
               ? sendNoContent(req)
               : sendError(req, "500 Internal Server Error", "forget_failed");
  }
  if (path == "/api/network/disconnect") {
    return wifiController_.disconnect() == ESP_OK
               ? sendNoContent(req)
               : sendError(req, "500 Internal Server Error",
                           "disconnect_failed");
  }
  if (path == "/api/network/reconnect") {
    return wifiController_.reconnect() == ESP_OK
               ? sendNoContent(req)
               : sendError(req, "409 Conflict", "no_saved_network");
  }
  if (path != "/api/network/status") {
    return sendError(req, "404 Not Found", "route_not_found");
  }

  JsonPtr json(cJSON_CreateObject(), cJSON_Delete);
  cJSON *networks = cJSON_CreateArray();
  if (!json || !networks) {
    cJSON_Delete(networks);
    return sendError(req, "500 Internal Server Error", "json_failed");
  }
  cJSON_AddBoolToObject(json.get(), "connected",
                        wifiController_.isStationConnected());
  const std::string ssid = wifiController_.getStationSsid();
  if (ssid.empty()) {
    cJSON_AddNullToObject(json.get(), "ssid");
  } else {
    cJSON_AddStringToObject(json.get(), "ssid", ssid.c_str());
  }
  cJSON_AddStringToObject(json.get(), "accessPoint",
                          wifiController_.getAccessPointSsid().c_str());
  cJSON_AddStringToObject(json.get(), "accessPointPassword",
                          wifiController_.getAccessPointPassword().c_str());

  char address[16] = {};
  esp_netif_t *station = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
  esp_netif_ip_info_t ipInfo = {};
  if (station && esp_netif_get_ip_info(station, &ipInfo) == ESP_OK &&
      ipInfo.ip.addr != 0) {
    esp_ip4addr_ntoa(&ipInfo.ip, address, sizeof(address));
  }
  cJSON_AddStringToObject(json.get(), "address", address);

  for (const WiFiNetwork &network : wifiController_.getScanResults()) {
    cJSON *item = cJSON_CreateObject();
    if (!item || !cJSON_AddStringToObject(item, "ssid", network.ssid.c_str()) ||
        !cJSON_AddNumberToObject(item, "rssi", network.rssi) ||
        !cJSON_AddBoolToObject(item, "secured", network.secure) ||
        !cJSON_AddItemToArray(networks, item)) {
      cJSON_Delete(item);
      cJSON_Delete(networks);
      return sendError(req, "500 Internal Server Error", "json_failed");
    }
  }
  cJSON_AddItemToObject(json.get(), "networks", networks);
  return sendJson(req, json.get());
}

esp_err_t API::deviceHandler(httpd_req_t *req) {
  return static_cast<API *>(req->user_ctx)->handleDevice(req);
}

esp_err_t API::handleDevice(httpd_req_t *req) {
  if (req->method == HTTP_POST) {
    const esp_err_t queued =
        httpd_queue_work(server_, &API::restartDeviceWork, nullptr);
    if (queued != ESP_OK) {
      return sendError(req, "500 Internal Server Error", "restart_failed");
    }
    JsonPtr json(cJSON_CreateObject(), cJSON_Delete);
    cJSON_AddStringToObject(json.get(), "status", "restarting");
    return sendJson(req, json.get(), "202 Accepted");
  }

  const esp_app_desc_t *description = esp_app_get_description();
  JsonPtr json(cJSON_CreateObject(), cJSON_Delete);
  if (!json || !cJSON_AddStringToObject(json.get(), "name", "Neat") ||
      !cJSON_AddStringToObject(json.get(), "model", CONFIG_IDF_TARGET) ||
      !cJSON_AddStringToObject(json.get(), "version", description->version)) {
    return sendError(req, "500 Internal Server Error", "json_failed");
  }
  return sendJson(req, json.get());
}

void API::restartDeviceWork(void *arg) { esp_restart(); }

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
    httpd_resp_set_hdr(req, "Cache-Control",
                       "public, max-age=31536000, immutable");
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

  if (cJSON_AddStringToObject(root.get(), "type", "wifi_scan_done") ==
      nullptr) {
    return;
  }

  for (const WiFiNetwork &network : networks) {
    cJSON *item = cJSON_CreateObject();
    if (item == nullptr ||
        cJSON_AddStringToObject(item, "ssid", network.ssid.c_str()) ==
            nullptr ||
        cJSON_AddNumberToObject(item, "rssi", network.rssi) == nullptr ||
        cJSON_AddBoolToObject(item, "secured", network.secure) == nullptr ||
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

void API::handleMachineEvent(MachineEvent event,
                             std::optional<std::uint8_t> pumpId) {
  switch (event) {
  case MachineEvent::GLASS_REMOVED:
    sendWebSocketMessage(R"({"type":"machine_error","error":"glass_removed"})");
    break;
  case MachineEvent::BOTTLE_MAY_BE_EMPTY: {
    if (!pumpId) {
      break;
    }
    JsonPtr json(cJSON_CreateObject(), cJSON_Delete);
    if (!json || !cJSON_AddStringToObject(json.get(), "type",
                                          "machine_warning") ||
        !cJSON_AddStringToObject(json.get(), "warning",
                                 "bottle_may_be_empty") ||
        !cJSON_AddNumberToObject(json.get(), "pumpId", *pumpId)) {
      break;
    }
    JsonStringPtr message(cJSON_PrintUnformatted(json.get()), cJSON_free);
    if (message) {
      sendWebSocketMessage(message.get());
    }
    break;
  }
  }
}
