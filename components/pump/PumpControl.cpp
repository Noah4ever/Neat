#include "pump/PumpControl.hpp"

#include <algorithm>
#include <memory>
#include <utility>

#include "io/GPIOOutput.hpp"

PumpControl::PumpControl() {}

void PumpControl::init(const std::vector<PumpConfig> &pumpConfigs) {
  pumps_.clear();
  pumps_.reserve(pumpConfigs.size());

  for (const auto &config : pumpConfigs) {
    addPump(config);
  }
}

void PumpControl::update() {
  for (auto &pump : pumps_) {
    pump.update();
  }
}

PumpResult PumpControl::addPump(const PumpConfig &config) {
  if (findPumpById(config.id)) {
    return PumpResult::DUPLICATE_ID;
  }

  pumps_.push_back(createPump(config));
  return PumpResult::SUCCESS;
}

PumpResult PumpControl::updatePump(const PumpConfig &config) {
  if (auto *pump = findPumpById(config.id)) {
    // Stop the physical output before replacing the Pump object.
    // Otherwise the MOSFET could remain HIGH.
    pump->stop();

    *pump = createPump(config);
    return PumpResult::SUCCESS;
  } else {
    return PumpResult::PUMP_NOT_FOUND;
  }
}

PumpResult PumpControl::deletePump(std::uint8_t pumpId) {
  if (auto *pump = findPumpById(pumpId)) {
    // Stop the physical output before replacing the Pump object.
    // Otherwise the MOSFET could remain HIGH.
    pump->stop();
  }

  const auto removed = std::erase_if(
      pumps_, [pumpId](const Pump &pump) { return pump.id() == pumpId; });

  if (removed == 0) {
    return PumpResult::PUMP_NOT_FOUND;
  }
  return PumpResult::SUCCESS;
}

PumpResult
PumpControl::setPumpIngredient(std::uint8_t pumpId,
                               std::optional<std::uint16_t> ingredientId) {

  auto *pump = findPumpById(pumpId);

  if (!pump)
    return PumpResult::PUMP_NOT_FOUND;

  pump->setIngredientId(ingredientId);

  return PumpResult::SUCCESS;
}

PumpResult PumpControl::setPumpCalibration(std::uint8_t pumpId,
                                           float mlPerSec) {

  auto *pump = findPumpById(pumpId);

  if (!pump)
    return PumpResult::PUMP_NOT_FOUND;

  if (mlPerSec <= 0.0f)
    return PumpResult::INVALID_CALIBRATION;

  pump->setCalibration(mlPerSec);

  return PumpResult::SUCCESS;
}

std::optional<std::uint8_t>
PumpControl::findPumpIdByIngredientId(std::uint16_t ingredientId) {
  const auto pump = std::find_if(
      pumps_.begin(), pumps_.end(), [ingredientId](const Pump &candidate) {
        const std::optional<std::uint16_t> assignedIngredient =
            candidate.getIngredientId();
        return assignedIngredient.has_value() &&
               *assignedIngredient == ingredientId;
      });

  if (pump == pumps_.end()) {
    return std::nullopt;
  }

  return pump->id();
}

PumpResult PumpControl::validatePump(std::uint8_t pumpId) const {
  const auto pump = std::find_if(
      pumps_.begin(), pumps_.end(),
      [pumpId](const Pump &candidate) { return candidate.id() == pumpId; });

  if (pump == pumps_.end()) {
    return PumpResult::PUMP_NOT_FOUND;
  }

  const auto flowRate = pump->getFlowRate();
  if (!flowRate.has_value()) {
    return PumpResult::NOT_CALIBRATED;
  }
  if (*flowRate <= 0.0f) {
    return PumpResult::INVALID_CALIBRATION;
  }

  return PumpResult::SUCCESS;
}

PumpResult PumpControl::startPump(std::uint8_t pumpId, std::uint16_t amountMl) {
  auto *pump = findPumpById(pumpId);

  if (!pump)
    return PumpResult::PUMP_NOT_FOUND;

  if (amountMl == 0)
    return PumpResult::INVALID_AMOUNT;

  auto flowRate = pump->getFlowRate();

  if (!flowRate)
    return PumpResult::NOT_CALIBRATED;

  if (*flowRate <= 0.0f)
    return PumpResult::INVALID_CALIBRATION;

  const std::int64_t durationUs = static_cast<std::int64_t>(
      (static_cast<float>(amountMl) / *flowRate) * 1'000'000.0f);

  pump->startFor(durationUs);

  return PumpResult::SUCCESS;
}

PumpResult PumpControl::startPumpForDuration(std::uint8_t pumpId,
                                             std::uint64_t durationMs) {
  auto *pump = findPumpById(pumpId);

  if (!pump)
    return PumpResult::PUMP_NOT_FOUND;

  if (durationMs == 0)
    return PumpResult::INVALID_AMOUNT;

  pump->startFor(durationMs * 1000);

  return PumpResult::SUCCESS;
}

void PumpControl::startAllPumpsForDuration(std::uint64_t durationMs) {
  for (auto &pump : pumps_) {
    startPumpForDuration(pump.id(), durationMs);
  }
}

PumpResult PumpControl::stopPump(std::uint8_t pumpId) {
  if (auto *pump = findPumpById(pumpId)) {
    pump->stop();
    return PumpResult::SUCCESS;
  } else {
    return PumpResult::PUMP_NOT_FOUND;
  }
}

void PumpControl::stopAllPumps() {
  for (auto &pump : pumps_) {
    pump.stop();
  }
}

bool PumpControl::isPumpRunning(std::uint8_t pumpId) const {
  const auto pump = std::find_if(
      pumps_.begin(), pumps_.end(),
      [pumpId](const Pump &candidate) { return candidate.id() == pumpId; });
  return pump != pumps_.end() && pump->isRunning();
}

std::vector<std::uint8_t> PumpControl::pumpIds() const {
  std::vector<std::uint8_t> ids;
  ids.reserve(pumps_.size());
  for (const Pump &pump : pumps_) {
    ids.push_back(pump.id());
  }
  return ids;
}

Pump PumpControl::createPump(const PumpConfig &config) {
  std::unique_ptr<OutputChannel> output;

  switch (config.outputConfig.type) {
  case OutputChannelType::GPIO:
    output = std::make_unique<GPIOOutput>(
        static_cast<gpio_num_t>(config.outputConfig.channel));
    break;
  }

  Pump pump(config.id, std::move(output));

  if (config.ingredientId.has_value()) {
    pump.setIngredientId(config.ingredientId.value());
  }
  if (config.mlPerSec) {
    pump.setCalibration(*config.mlPerSec);
  }

  return pump;
}

Pump *PumpControl::findPumpById(std::uint8_t id) {
  auto it = std::find_if(pumps_.begin(), pumps_.end(),
                         [id](const Pump &pump) { return pump.id() == id; });

  if (it == pumps_.end()) {
    return nullptr;
  }

  return &(*it);
}
