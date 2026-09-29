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
constexpr char kSuccessSoundKey[] = "success_sound";
constexpr char kErrorSoundKey[] = "error_sound";

bool soundValid(const std::vector<BuzzerTone> &sound) {
  return !sound.empty() && sound.size() <= 12 &&
         std::all_of(sound.begin(), sound.end(), [](const BuzzerTone &tone) {
           return tone.frequencyHz >= 100 && tone.frequencyHz <= 5000 &&
                  tone.durationMs >= 20 && tone.durationMs <= 2000;
         });
}

bool settingsValid(const DeviceSettings &settings) {
  if (settings.drinkSizesMl.empty() || settings.drinkSizesMl.size() > 16 ||
      !std::isfinite(settings.alcoholStrengthLessFactor) ||
      !std::isfinite(settings.alcoholStrengthMoreFactor) ||
      settings.alcoholStrengthLessFactor <= 0.0f ||
      settings.alcoholStrengthLessFactor >= 1.0f ||
      settings.alcoholStrengthMoreFactor <= 1.0f ||
      !soundValid(settings.successSound) || !soundValid(settings.errorSound)) {
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
void readSound(nvs_handle_t handle, const char *key,
               std::vector<BuzzerTone> &sound) {
  std::size_t bytes = 0;
  if (nvs_get_blob(handle, key, nullptr, &bytes) != ESP_OK || bytes == 0 ||
      bytes % sizeof(BuzzerTone) != 0 || bytes / sizeof(BuzzerTone) > 12) return;
  std::vector<BuzzerTone> value(bytes / sizeof(BuzzerTone));
  if (nvs_get_blob(handle, key, value.data(), &bytes) == ESP_OK && soundValid(value))
    sound = std::move(value);
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
  readSound(handle, kSuccessSoundKey, settings.successSound);
  readSound(handle, kErrorSoundKey, settings.errorSound);
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
  if (result == ESP_OK) result = nvs_set_blob(handle, kSuccessSoundKey, settings.successSound.data(), settings.successSound.size() * sizeof(BuzzerTone));
  if (result == ESP_OK) result = nvs_set_blob(handle, kErrorSoundKey, settings.errorSound.data(), settings.errorSound.size() * sizeof(BuzzerTone));
  if (result == ESP_OK) {
    result = nvs_commit(handle);
  }
  nvs_close(handle);
  return result == ESP_OK;
}
