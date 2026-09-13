#pragma once

#include <cstdint>
#include <optional>

#include "io/OutputChannelConfig.hpp"

struct PumpConfig {
  std::uint8_t id;
  std::optional<uint16_t> ingredientId;
  std::optional<float> mlPerSec;
  OutputChannelConfig outputConfig;
};
