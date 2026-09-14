#include "settings/DeviceSettingsRepository.hpp"

#include <cstdint>

#include "nvs.h"

namespace {

constexpr char kNamespace[] = "device_settings";
constexpr char kPumpLedKey[] = "pump_leds";

} // namespace

DeviceSettings DeviceSettingsRepository::load() const {
  DeviceSettings settings;
  nvs_handle_t handle = 0;
  if (nvs_open(kNamespace, NVS_READONLY, &handle) != ESP_OK) {
    return settings;
  }

  std::uint8_t enabled = settings.activateLedWhenPumpActive ? 1 : 0;
  if (nvs_get_u8(handle, kPumpLedKey, &enabled) == ESP_OK) {
    settings.activateLedWhenPumpActive = enabled != 0;
  }
  nvs_close(handle);
  return settings;
}

bool DeviceSettingsRepository::save(const DeviceSettings &settings) const {
  nvs_handle_t handle = 0;
  if (nvs_open(kNamespace, NVS_READWRITE, &handle) != ESP_OK) {
    return false;
  }

  const esp_err_t writeResult = nvs_set_u8(
      handle, kPumpLedKey, settings.activateLedWhenPumpActive ? 1 : 0);
  const esp_err_t commitResult =
      writeResult == ESP_OK ? nvs_commit(handle) : writeResult;
  nvs_close(handle);
  return writeResult == ESP_OK && commitResult == ESP_OK;
}
