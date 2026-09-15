#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

class MediaStorage;
class WiFiController;

struct StorageUsage {
  std::size_t totalBytes = 0;
  std::size_t usedBytes = 0;
};

struct SystemStatus {
  std::uint64_t uptimeMs = 0;
  std::size_t freeHeapBytes = 0;
  std::size_t minimumFreeHeapBytes = 0;
  std::size_t largestFreeBlockBytes = 0;
  float cpuUtilizationPercent = 0.0f;
  StorageUsage firmware;
  StorageUsage configurationStorage;
  StorageUsage webStorage;
  StorageUsage mediaStorage;
  std::string wifiMode;
  bool stationConnected = false;
  int rssi = 0;
  bool accessPointActive = true;
};

class SystemMonitor {
public:
  using UpdateCallback = std::function<void(const SystemStatus &)>;

  SystemMonitor(WiFiController &wifiController, MediaStorage &mediaStorage);
  void update();
  const SystemStatus &status() const;
  void setUpdateCallback(UpdateCallback callback);

private:
  WiFiController &wifiController_;
  MediaStorage &mediaStorage_;
  SystemStatus status_;
  UpdateCallback callback_;
  std::int64_t lastUpdatedAtUs_ = -1000000;
  std::uint32_t previousTotalRuntime_ = 0;
  std::uint32_t previousIdleRuntime_ = 0;
};
