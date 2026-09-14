#pragma once

#include <cstdint>
#include <optional>
#include <vector>

#include "bottle/BottleState.hpp"

class BottleStateRepository {
public:
  std::vector<BottleState> loadAll() const;
  std::optional<BottleState> findByPumpId(std::uint8_t pumpId) const;
  bool update(const BottleState &state) const;

private:
  bool readAll(std::vector<BottleState> &states) const;
  bool saveAll(const std::vector<BottleState> &states) const;
};
