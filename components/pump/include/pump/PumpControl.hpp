#pragma once

#include <cstdint>
#include <optional>
#include <vector>

#include "pump/Pump.hpp"
#include "pump/PumpConfig.hpp"

enum class PumpResult {
  SUCCESS,
  PUMP_NOT_FOUND,
  NOT_CALIBRATED,
  INVALID_CALIBRATION,
  INVALID_AMOUNT,
  DUPLICATE_ID,
  INVALID_CONFIG
};

class PumpControl {
public:
  PumpControl();

  void init(const std::vector<PumpConfig> &pumpConfigs);
  void update();

  PumpResult addPump(const PumpConfig &config);
  PumpResult updatePump(const PumpConfig &config);
  PumpResult deletePump(std::uint8_t pumpId);

  PumpResult setPumpIngredient(std::uint8_t pumpId,
                               std::optional<std::uint16_t> ingredientId);

  PumpResult setPumpCalibration(std::uint8_t pumpId, float mlPerSec);

  std::optional<std::uint8_t>
  findPumpIdByIngredientId(std::uint16_t ingredientId);
  PumpResult validatePump(std::uint8_t pumpId) const;

  PumpResult startPump(std::uint8_t pumpId, std::uint16_t amountMl);
  PumpResult startPumpForDuration(std::uint8_t pumpId,
                                  std::uint64_t durationMs);
  void startAllPumpsForDuration(std::uint64_t durationMs);

  PumpResult stopPump(std::uint8_t pumpId);
  void stopAllPumps();

private:
  std::vector<Pump> pumps_;

  Pump createPump(const PumpConfig &config);
  Pump *findPumpById(std::uint8_t id);
};
