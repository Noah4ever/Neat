#pragma once

#include <atomic>
#include <functional>
#include <string>
#include <vector>

#include "esp_err.h"
#include "esp_event.h" // IWYU pragma: keep

#include "wifi/WiFiNetwork.hpp"

class WiFiController {
public:
  using ScanFinishedCallback =
      std::function<void(const std::vector<WiFiNetwork> &)>;

  WiFiController(std::string apSsid, std::string apPassword);

  esp_err_t init();

  esp_err_t startScan();
  esp_err_t connect(const std::string &ssid, const std::string &password);
  esp_err_t disconnect();
  esp_err_t reconnect();
  esp_err_t forgetNetwork();

  bool isScanInProgress() const;
  bool isStationConnected() const;
  bool testInternetAccess() const;
  std::string getStationSsid() const;
  std::string getAccessPointSsid() const;
  std::string getAccessPointPassword() const;

  const std::vector<WiFiNetwork> &getScanResults() const;

  void setScanFinishedCallback(ScanFinishedCallback callback);

private:
  std::string apSsid_;
  std::string apPassword_;

  std::atomic<bool> stationConnected_{false};
  std::atomic<bool> scanInProgress_{false};
  std::atomic<bool> reconnectEnabled_{true};

  std::vector<WiFiNetwork> scanResults_;

  ScanFinishedCallback scanFinishedCallback_;

  esp_err_t configureAccessPoint();
  void connectSavedNetwork();
  void handleScanFinished();

  static void eventHandler(void *arg, esp_event_base_t eventBase,
                           int32_t eventId, void *eventData);

  void handleEvent(esp_event_base_t eventBase, int32_t eventId,
                   void *eventData);
};
