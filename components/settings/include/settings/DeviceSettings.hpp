#pragma once

#include <cstdint>
#include <vector>

struct DeviceSettings {
  bool activateLedWhenPumpActive = true;
  bool requireGlassDetection = true;
  std::vector<std::uint16_t> drinkSizesMl = {300, 400, 500};
  std::uint16_t defaultDrinkSizeMl = 400;
  float alcoholStrengthLessFactor = 0.75f;
  float alcoholStrengthMoreFactor = 1.25f;
};
