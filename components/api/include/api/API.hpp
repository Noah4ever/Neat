#pragma once

#include <string>

#include "esp_err.h"
#include "esp_http_server.h"
#include "machine/MachineLogic.hpp"
#include "pump/PumpControl.hpp"
#include "storage/IngredientConfigRepository.hpp"
#include "storage/PumpConfigRepository.hpp"
#include "storage/RecipeConfigRepository.hpp"
#include "wifi/WiFiController.hpp"
#include "wifi/WiFiNetwork.hpp"

class API {
public:
  API(MachineLogic &machineLogic, PumpControl &pumpControl,
      WiFiController &wifiController,
      RecipeConfigRepository &recipeRepository,
      IngredientConfigRepository &ingredientRepository,
      PumpConfigRepository &pumpRepository);
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

  httpd_handle_t server_ = nullptr;
  bool webFileSystemMounted_ = false;

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

  static esp_err_t deviceHandler(httpd_req_t *req);
  esp_err_t handleDevice(httpd_req_t *req);
  static void restartDeviceWork(void *arg);

  static esp_err_t networkScanHandler(httpd_req_t *req);
  esp_err_t handleNetworkScan(httpd_req_t *req);

  static esp_err_t staticFileHandler(httpd_req_t *req);
  esp_err_t handleStaticFile(httpd_req_t *req);
  esp_err_t sendFile(httpd_req_t *req, const std::string &path);

  void handleWiFiScanFinished(const std::vector<WiFiNetwork> &networks);

  enum class OperationKind { NONE, DRINK, CLEANING, CALIBRATION };
  enum class OperationState { IDLE, RUNNING, FINISHED, STOPPED };

  OperationKind operationKind_ = OperationKind::NONE;
  OperationState operationState_ = OperationState::IDLE;
  std::int64_t operationStartedAtUs_ = 0;
  std::uint64_t operationDurationMs_ = 0;
  std::uint16_t operationRecipeId_ = 0;
  std::uint8_t calibrationPumpId_ = 0;
  std::string operationLabel_;
};
