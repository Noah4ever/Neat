#include "settings/DeviceSettingsRepository.hpp"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <utility>
#include <vector>

#include "nvs.h"

namespace {
constexpr char kNamespace[] = "device_settings";
constexpr char kPumpLedKey[] = "pump_leds";
constexpr char kRequireGlassKey[] = "require_glass";
constexpr char kDrinkSizesKey[] = "drink_sizes";
constexpr char kDefaultSizeKey[] = "default_size";
constexpr char kLessFactorKey[] = "less_factor";
constexpr char kMoreFactorKey[] = "more_factor";

bool settingsValid(const DeviceSettings &settings) {
  if (settings.drinkSizesMl.empty() || settings.drinkSizesMl.size() > 16 ||
      !std::isfinite(settings.alcoholStrengthLessFactor) ||
      !std::isfinite(settings.alcoholStrengthMoreFactor) ||
      settings.alcoholStrengthLessFactor <= 0.0f ||
      settings.alcoholStrengthLessFactor >= 1.0f ||
      settings.alcoholStrengthMoreFactor <= 1.0f) {
    return false;
  }
  std::vector<std::uint16_t> sizes = settings.drinkSizesMl;
  std::sort(sizes.begin(), sizes.end());
  if (sizes.front() == 0 ||
      std::adjacent_find(sizes.begin(), sizes.end()) != sizes.end()) {
    return false;
  }
  return std::find(sizes.begin(), sizes.end(), settings.defaultDrinkSizeMl) !=
         sizes.end();
}

bool readFloat(nvs_handle_t handle, const char *key, float &value) {
  std::size_t size = sizeof(value);
  return nvs_get_blob(handle, key, &value, &size) == ESP_OK &&
         size == sizeof(value) && std::isfinite(value);
}
} // namespace

DeviceSettings DeviceSettingsRepository::load() const {
  DeviceSettings defaults;
  DeviceSettings settings = defaults;
  nvs_handle_t handle = 0;
  if (nvs_open(kNamespace, NVS_READONLY, &handle) != ESP_OK) {
    return settings;
  }

  std::uint8_t enabled = settings.activateLedWhenPumpActive ? 1 : 0;
  if (nvs_get_u8(handle, kPumpLedKey, &enabled) == ESP_OK) {
    settings.activateLedWhenPumpActive = enabled != 0;
  }

  enabled = settings.requireGlassDetection ? 1 : 0;
  if (nvs_get_u8(handle, kRequireGlassKey, &enabled) == ESP_OK) {
    settings.requireGlassDetection = enabled != 0;
  }

  std::size_t sizesBytes = 0;
  if (nvs_get_blob(handle, kDrinkSizesKey, nullptr, &sizesBytes) == ESP_OK &&
      sizesBytes > 0 && sizesBytes % sizeof(std::uint16_t) == 0 &&
      sizesBytes / sizeof(std::uint16_t) <= 16) {
    std::vector<std::uint16_t> sizes(sizesBytes / sizeof(std::uint16_t));
    if (nvs_get_blob(handle, kDrinkSizesKey, sizes.data(), &sizesBytes) ==
        ESP_OK) {
      settings.drinkSizesMl = std::move(sizes);
    }
  }

  nvs_get_u16(handle, kDefaultSizeKey, &settings.defaultDrinkSizeMl);
  readFloat(handle, kLessFactorKey, settings.alcoholStrengthLessFactor);
  readFloat(handle, kMoreFactorKey, settings.alcoholStrengthMoreFactor);
  nvs_close(handle);

  if (!settingsValid(settings)) {
    defaults.activateLedWhenPumpActive = settings.activateLedWhenPumpActive;
    defaults.requireGlassDetection = settings.requireGlassDetection;
    return defaults;
  }
  std::sort(settings.drinkSizesMl.begin(), settings.drinkSizesMl.end());
  return settings;
}

bool DeviceSettingsRepository::save(const DeviceSettings &settings) const {
  if (!settingsValid(settings)) {
    return false;
  }
  std::vector<std::uint16_t> sizes = settings.drinkSizesMl;
  std::sort(sizes.begin(), sizes.end());

  nvs_handle_t handle = 0;
  if (nvs_open(kNamespace, NVS_READWRITE, &handle) != ESP_OK) {
    return false;
  }

  esp_err_t result = nvs_set_u8(
      handle, kPumpLedKey, settings.activateLedWhenPumpActive ? 1 : 0);
  if (result == ESP_OK) {
    result = nvs_set_u8(handle, kRequireGlassKey,
                        settings.requireGlassDetection ? 1 : 0);
  }
  if (result == ESP_OK) {
    result = nvs_set_blob(handle, kDrinkSizesKey, sizes.data(),
                          sizes.size() * sizeof(std::uint16_t));
  }
  if (result == ESP_OK) {
    result = nvs_set_u16(handle, kDefaultSizeKey,
                         settings.defaultDrinkSizeMl);
  }
  if (result == ESP_OK) {
    result = nvs_set_blob(handle, kLessFactorKey,
                          &settings.alcoholStrengthLessFactor,
                          sizeof(settings.alcoholStrengthLessFactor));
  }
  if (result == ESP_OK) {
    result = nvs_set_blob(handle, kMoreFactorKey,
                          &settings.alcoholStrengthMoreFactor,
                          sizeof(settings.alcoholStrengthMoreFactor));
  }
  if (result == ESP_OK) {
    result = nvs_commit(handle);
  }
  nvs_close(handle);
  return result == ESP_OK;
}
