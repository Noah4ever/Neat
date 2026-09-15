#include "system/SystemMonitor.hpp"

#include <algorithm>
#include <utility>
#include <vector>

#include "esp_heap_caps.h"
#include "esp_image_format.h"
#include "esp_ota_ops.h"
#include "esp_spiffs.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "media/MediaStorage.hpp"
#include "wifi/WiFiController.hpp"

namespace {
StorageUsage spiffsUsage(const char *label) {
  StorageUsage usage;
  esp_spiffs_info(label, &usage.totalBytes, &usage.usedBytes);
  return usage;
}
} // namespace

SystemMonitor::SystemMonitor(WiFiController &wifiController,
                             MediaStorage &mediaStorage)
    : wifiController_(wifiController), mediaStorage_(mediaStorage) {}

void SystemMonitor::update() {
  const std::int64_t now = esp_timer_get_time();
  if (now - lastUpdatedAtUs_ < 1000000) return;
  lastUpdatedAtUs_ = now;

  status_.uptimeMs = static_cast<std::uint64_t>(now / 1000);
  status_.freeHeapBytes = esp_get_free_heap_size();
  status_.minimumFreeHeapBytes = esp_get_minimum_free_heap_size();
  status_.largestFreeBlockBytes =
      heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);

  const UBaseType_t taskCount = uxTaskGetNumberOfTasks();
  std::vector<TaskStatus_t> tasks(taskCount + 2);
  configRUN_TIME_COUNTER_TYPE totalRuntime = 0;
  const UBaseType_t written =
      uxTaskGetSystemState(tasks.data(), tasks.size(), &totalRuntime);
  std::uint32_t idleRuntime = 0;
  const TaskHandle_t idleHandle = xTaskGetIdleTaskHandle();
  for (UBaseType_t index = 0; index < written; ++index) {
    if (tasks[index].xHandle == idleHandle) {
      idleRuntime = static_cast<std::uint32_t>(tasks[index].ulRunTimeCounter);
      break;
    }
  }
  const std::uint32_t total = static_cast<std::uint32_t>(totalRuntime);
  const std::uint32_t totalDelta = total - previousTotalRuntime_;
  const std::uint32_t idleDelta = idleRuntime - previousIdleRuntime_;
  if (previousTotalRuntime_ != 0 && totalDelta > 0) {
    status_.cpuUtilizationPercent = std::clamp(
        100.0f * (1.0f - static_cast<float>(idleDelta) / totalDelta), 0.0f,
        100.0f);
  }
  previousTotalRuntime_ = total;
  previousIdleRuntime_ = idleRuntime;

  const esp_partition_t *running = esp_ota_get_running_partition();
  if (running) {
    esp_image_metadata_t metadata = {};
    const esp_partition_pos_t position = {.offset = running->address,
                                          .size = running->size};
    status_.firmware.totalBytes = running->size;
    status_.firmware.usedBytes =
        esp_image_get_metadata(&position, &metadata) == ESP_OK
            ? metadata.image_len
            : 0;
  }
  status_.configurationStorage = spiffsUsage("storage");
  status_.webStorage = spiffsUsage("web");
  const MediaStorageInfo media = mediaStorage_.info();
  status_.mediaStorage = {.totalBytes = media.totalBytes,
                          .usedBytes = media.usedBytes};

  status_.wifiMode = "AP + Wi-Fi";
  status_.stationConnected = wifiController_.isStationConnected();
  status_.accessPointActive = true;
  wifi_ap_record_t accessPoint = {};
  status_.rssi = status_.stationConnected &&
                         esp_wifi_sta_get_ap_info(&accessPoint) == ESP_OK
                     ? accessPoint.rssi
                     : 0;
  if (callback_) callback_(status_);
}

const SystemStatus &SystemMonitor::status() const { return status_; }

void SystemMonitor::setUpdateCallback(UpdateCallback callback) {
  callback_ = std::move(callback);
}
