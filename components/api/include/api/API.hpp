#pragma once

#include <cstdint>
#include <optional>
#include <string>

#include "bottle/BottleStateRepository.hpp"
#include "developer/DeveloperControl.hpp"
#include "esp_err.h"
#include "esp_http_server.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "machine/MachineLogic.hpp"
#include "media/MediaStorage.hpp"
#include "pump/PumpControl.hpp"
#include "storage/IngredientConfigRepository.hpp"
#include "storage/PumpConfigRepository.hpp"
#include "storage/RecipeConfigRepository.hpp"
#include "system/SystemMonitor.hpp"
#include "wifi/WiFiController.hpp"
#include "wifi/WiFiNetwork.hpp"

class API {
public:
  API(MachineLogic &machineLogic, PumpControl &pumpControl,
      WiFiController &wifiController, RecipeConfigRepository &recipeRepository,
      IngredientConfigRepository &ingredientRepository,
      PumpConfigRepository &pumpRepository,
      BottleStateRepository &bottleStateRepository,
      MediaStorage &mediaStorage, SystemMonitor &systemMonitor,
      DeveloperControl &developerControl);
  esp_err_t start();
  void stop();

  void sendWebSocketMessage(const std::string &message);

private:
  MachineLogic &machineLogic_;
  PumpControl &pumpControl_;
  WiFiController &wifiController_;
  RecipeConfigRepository &recipeRepository_;
  IngredientConfigRepository &ingredientRepository_;
  PumpConfigRepository &pumpRepository_;
  BottleStateRepository &bottleStateRepository_;
  MediaStorage &mediaStorage_;
  SystemMonitor &systemMonitor_;
  DeveloperControl &developerControl_;

  httpd_handle_t server_ = nullptr;
  bool webFileSystemMounted_ = false;
  TaskHandle_t cloudHeartbeatTask_ = nullptr;

  esp_err_t mountWebFileSystem();
  esp_err_t registerRoutes();

  static esp_err_t websocketHandler(httpd_req_t *req);
  esp_err_t handleWebsocket(httpd_req_t *req);

  static void sendWebSocketWork(void *arg);
  void broadcastWebSocketMessage(const std::string &message);

  static esp_err_t healthHandler(httpd_req_t *req);
  esp_err_t handleHealth(httpd_req_t *req);

  static esp_err_t statusHandler(httpd_req_t *req);
  esp_err_t handleStatus(httpd_req_t *req);

  static esp_err_t recipesHandler(httpd_req_t *req);
  esp_err_t handleRecipes(httpd_req_t *req);

  static esp_err_t ingredientsHandler(httpd_req_t *req);
  esp_err_t handleIngredients(httpd_req_t *req);

  static esp_err_t pumpsHandler(httpd_req_t *req);
  esp_err_t handlePumps(httpd_req_t *req);

  static esp_err_t cleaningHandler(httpd_req_t *req);
  esp_err_t handleCleaning(httpd_req_t *req);

  static esp_err_t calibrationHandler(httpd_req_t *req);
  esp_err_t handleCalibration(httpd_req_t *req);

  static esp_err_t operationHandler(httpd_req_t *req);
  esp_err_t handleOperation(httpd_req_t *req);

  static esp_err_t networkHandler(httpd_req_t *req);
  esp_err_t handleNetwork(httpd_req_t *req);

  static esp_err_t cloudHandler(httpd_req_t *req);
  esp_err_t handleCloud(httpd_req_t *req);
  static void cloudHeartbeatWork(void *arg);

  static esp_err_t deviceHandler(httpd_req_t *req);
  esp_err_t handleDevice(httpd_req_t *req);
  static void restartDeviceWork(void *arg);

  static esp_err_t deviceSettingsHandler(httpd_req_t *req);
  esp_err_t handleDeviceSettings(httpd_req_t *req);

  static esp_err_t bottlesHandler(httpd_req_t *req);
  esp_err_t handleBottles(httpd_req_t *req);

  static esp_err_t mediaHandler(httpd_req_t *req);
  esp_err_t handleMedia(httpd_req_t *req);

  static esp_err_t systemHandler(httpd_req_t *req);
  esp_err_t handleSystem(httpd_req_t *req);
  void handleSystemStatus(const SystemStatus &status);

  static esp_err_t developerHandler(httpd_req_t *req);
  esp_err_t handleDeveloper(httpd_req_t *req);

  esp_err_t handleNetworkScan(httpd_req_t *req);

  static esp_err_t staticFileHandler(httpd_req_t *req);
  esp_err_t handleStaticFile(httpd_req_t *req);
  esp_err_t sendFile(httpd_req_t *req, const std::string &path);

  void handleWiFiScanFinished(const std::vector<WiFiNetwork> &networks);
  void handleMachineEvent(MachineEvent event,
                          std::optional<std::uint8_t> pumpId);
};
