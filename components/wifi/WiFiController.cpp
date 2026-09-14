#include "wifi/WiFiController.hpp"

#include <cstring>
#include <utility>

#include "esp_netif.h"
#include "esp_wifi.h"
#include "nvs_flash.h"

WiFiController::WiFiController(std::string apSsid, std::string apPassword)
    : apSsid_(std::move(apSsid)), apPassword_(std::move(apPassword)) {}

esp_err_t WiFiController::init() {
  esp_err_t result = nvs_flash_init();

  if (result == ESP_ERR_NVS_NO_FREE_PAGES ||
      result == ESP_ERR_NVS_NEW_VERSION_FOUND) {

    result = nvs_flash_erase();

    if (result != ESP_OK) {
      return result;
    }

    result = nvs_flash_init();
  }

  if (result != ESP_OK) {
    return result;
  }

  result = esp_netif_init();

  if (result != ESP_OK) {
    return result;
  }

  result = esp_event_loop_create_default();

  if (result != ESP_OK) {
    return result;
  }

  esp_netif_create_default_wifi_ap();
  esp_netif_create_default_wifi_sta();

  wifi_init_config_t wifiConfig = WIFI_INIT_CONFIG_DEFAULT();

  result = esp_wifi_init(&wifiConfig);

  if (result != ESP_OK) {
    return result;
  }

  result = esp_wifi_set_storage(WIFI_STORAGE_FLASH);

  if (result != ESP_OK) {
    return result;
  }

  result = esp_wifi_set_mode(WIFI_MODE_APSTA);

  if (result != ESP_OK) {
    return result;
  }

  result = configureAccessPoint();

  if (result != ESP_OK) {
    return result;
  }

  result = esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                      &WiFiController::eventHandler, this);

  if (result != ESP_OK) {
    return result;
  }

  result = esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                      &WiFiController::eventHandler, this);

  if (result != ESP_OK) {
    return result;
  }

  return esp_wifi_start();
}

esp_err_t WiFiController::startScan() {
  if (scanInProgress_.load()) {
    return ESP_ERR_INVALID_STATE;
  }

  wifi_scan_config_t scanConfig = {};

  scanResults_.clear();

  const esp_err_t result = esp_wifi_scan_start(&scanConfig, false);

  if (result != ESP_OK) {
    return result;
  }

  scanInProgress_ = true;

  return ESP_OK;
}

esp_err_t WiFiController::connect(const std::string &ssid,
                                  const std::string &password) {
  if (ssid.empty() || ssid.size() > 32 || password.size() > 63) {
    return ESP_ERR_INVALID_ARG;
  }

  wifi_config_t config = {};
  std::memcpy(config.sta.ssid, ssid.data(), ssid.size());
  std::memcpy(config.sta.password, password.data(), password.size());

  esp_err_t result = esp_wifi_set_config(WIFI_IF_STA, &config);
  if (result != ESP_OK) {
    return result;
  }

  // Changing the STA configuration while connected requires a reconnect.
  esp_wifi_disconnect();
  return esp_wifi_connect();
}

bool WiFiController::isScanInProgress() const { return scanInProgress_.load(); }

bool WiFiController::isStationConnected() const {
  return stationConnected_.load();
}

std::string WiFiController::getStationSsid() const {
  wifi_config_t config = {};
  if (esp_wifi_get_config(WIFI_IF_STA, &config) != ESP_OK) {
    return {};
  }
  return reinterpret_cast<const char *>(config.sta.ssid);
}

std::string WiFiController::getAccessPointSsid() const { return apSsid_; }

const std::vector<WiFiNetwork> &WiFiController::getScanResults() const {
  return scanResults_;
}

void WiFiController::setScanFinishedCallback(ScanFinishedCallback callback) {
  scanFinishedCallback_ = std::move(callback);
}

esp_err_t WiFiController::configureAccessPoint() {
  if (apSsid_.empty() || apSsid_.size() > 32) {
    return ESP_ERR_INVALID_ARG;
  }

  if (apPassword_.size() < 8 || apPassword_.size() > 63) {
    return ESP_ERR_INVALID_ARG;
  }

  wifi_config_t config = {};

  std::memcpy(config.ap.ssid, apSsid_.data(), apSsid_.size());

  config.ap.ssid_len = apSsid_.size();

  std::memcpy(config.ap.password, apPassword_.data(), apPassword_.size());

  config.ap.channel = 1;
  config.ap.max_connection = 4;
  config.ap.authmode = WIFI_AUTH_WPA2_PSK;

  return esp_wifi_set_config(WIFI_IF_AP, &config);
}

void WiFiController::connectSavedNetwork() {
  wifi_config_t config = {};

  if (esp_wifi_get_config(WIFI_IF_STA, &config) != ESP_OK) {
    return;
  }

  if (config.sta.ssid[0] == '\0') {
    return;
  }

  esp_wifi_connect();
}

void WiFiController::handleScanFinished() {
  std::uint16_t networkCount = 0;

  esp_err_t result = esp_wifi_scan_get_ap_num(&networkCount);

  if (result != ESP_OK) {
    scanInProgress_ = false;
    return;
  }

  std::vector<wifi_ap_record_t> records(networkCount);

  if (networkCount > 0) {
    result = esp_wifi_scan_get_ap_records(&networkCount, records.data());

    if (result != ESP_OK) {
      scanInProgress_ = false;
      return;
    }
  }

  scanResults_.clear();
  scanResults_.reserve(networkCount);

  for (const auto &record : records) {
    WiFiNetwork network{.ssid = reinterpret_cast<const char *>(record.ssid),
                        .rssi = record.rssi,
                        .secure = record.authmode != WIFI_AUTH_OPEN};

    scanResults_.push_back(std::move(network));
  }

  scanInProgress_ = false;

  if (scanFinishedCallback_) {
    scanFinishedCallback_(scanResults_);
  }
}

void WiFiController::eventHandler(void *arg, esp_event_base_t eventBase,
                                  int32_t eventId, void *eventData) {

  auto *controller = static_cast<WiFiController *>(arg);

  controller->handleEvent(eventBase, eventId, eventData);
}

void WiFiController::handleEvent(esp_event_base_t eventBase, int32_t eventId,
                                 void *eventData) {

  if (eventBase == WIFI_EVENT) {
    if (eventId == WIFI_EVENT_STA_START) {
      connectSavedNetwork();
    }

    if (eventId == WIFI_EVENT_STA_DISCONNECTED) {
      stationConnected_ = false;

      connectSavedNetwork();
    }

    if (eventId == WIFI_EVENT_SCAN_DONE) {
      handleScanFinished();
    }
  }

  if (eventBase == IP_EVENT && eventId == IP_EVENT_STA_GOT_IP) {

    stationConnected_ = true;
  }
}
