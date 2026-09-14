#pragma once

#include <cstdint>

struct BottleState {
  std::uint8_t pumpId;
  std::uint16_t capacityMl;
  float remainingMl;
};
