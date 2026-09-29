#pragma once

#include <cstdint>
#include <vector>

struct BuzzerTone {
  std::uint16_t frequencyHz;
  std::uint16_t durationMs;
};

struct DeviceSettings {
  bool activateLedWhenPumpActive = true;
  bool requireGlassDetection = true;
  std::vector<std::uint16_t> drinkSizesMl = {300, 400, 500};
  std::uint16_t defaultDrinkSizeMl = 400;
  float alcoholStrengthLessFactor = 0.75f;
  float alcoholStrengthMoreFactor = 1.25f;
  std::vector<BuzzerTone> successSound = {{880, 90}, {1319, 140}};
  std::vector<BuzzerTone> errorSound = {{440, 130}, {330, 210}};
};
