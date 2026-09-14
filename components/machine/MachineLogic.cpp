#include "machine/MachineLogic.hpp"
#include "bottle/BottleState.hpp"
#include "machine/MachineEvent.hpp"
#include "pump/PumpControl.hpp"
#include "recipe/RecipeConfig.hpp"
#include "recipe/RecipeResults.hpp"
#include "storage/PumpConfigRepository.hpp"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <utility>

#include "esp_timer.h"

MachineLogic::MachineLogic(PumpControl &pumpControl,
                           RecipeConfigRepository &recipeRepository,
                           PumpConfigRepository &pumpRepository,
                           SensorHandling &sensorHandling,
                           FeedbackControl &feedbackControl,
                           DeviceSettingsRepository &deviceSettingsRepository,
                           BottleStateRepository &bottleStateRepository)
    : pumpControl_(pumpControl), recipeRepository_(recipeRepository),
      pumpRepository_(pumpRepository), sensorHandling_(sensorHandling),
      feedbackControl_(feedbackControl),
      deviceSettingsRepository_(deviceSettingsRepository),
      bottleStateRepository_(bottleStateRepository),
      deviceSettings_(deviceSettingsRepository.load()),
      currentCalibrationPumpId_(0),
      currentCalibrationDurationMs_(0) {}

void MachineLogic::init() {}

void MachineLogic::update() {
  pumpControl_.update();
  refreshOperationState();

  if (operationKind_ == MachineOperationKind::DRINK &&
      operationState_ == MachineOperationState::RUNNING &&
      !sensorHandling_.isGlassPresent()) {

    pumpControl_.stopAllPumps();
    operationState_ = MachineOperationState::STOPPED;
    operationDurationMs_ = 0;
    pendingBottleConsumption_.clear();

    feedbackControl_.playError();

    emitEvent(MachineEvent::GLASS_REMOVED);
  }

  synchronizePumpLeds();
}

void MachineLogic::refreshOperationState() {
  if (operationState_ == MachineOperationState::RUNNING &&
      operationDurationMs_ > 0 &&
      esp_timer_get_time() - operationStartedAtUs_ >=
          static_cast<std::int64_t>(operationDurationMs_ * 1000)) {

    operationState_ = MachineOperationState::FINISHED;

    if (operationKind_ == MachineOperationKind::DRINK) {
      finishDrinkSuccessfully();
    }
  }
}

void MachineLogic::finishDrinkSuccessfully() {
  feedbackControl_.playSuccess();

  for (const BottleConsumption &consumption : pendingBottleConsumption_) {
    std::optional<BottleState> bottle =
        bottleStateRepository_.findByPumpId(consumption.pumpId);
    if (!bottle) {
      continue;
    }

    bottle->remainingMl =
        std::max(0.0f, bottle->remainingMl - consumption.amountMl);
    if (bottleStateRepository_.update(*bottle) &&
        bottle->remainingMl <= 0.0f) {
      emitEvent(MachineEvent::BOTTLE_MAY_BE_EMPTY, consumption.pumpId);
    }
  }
  pendingBottleConsumption_.clear();
}

void MachineLogic::synchronizePumpLeds() {
  feedbackControl_.turnOffAllPumpLeds();
  if (!deviceSettings_.activateLedWhenPumpActive) {
    return;
  }

  for (const std::uint8_t pumpId : pumpControl_.pumpIds()) {
    feedbackControl_.setPumpLed(pumpId,
                                pumpControl_.isPumpRunning(pumpId));
  }
}

bool MachineLogic::isOperationBusy() {
  refreshOperationState();
  return operationState_ == MachineOperationState::RUNNING ||
         (operationKind_ == MachineOperationKind::CALIBRATION &&
          operationState_ == MachineOperationState::FINISHED);
}

void MachineLogic::beginOperation(MachineOperationKind kind,
                                  std::uint64_t durationMs, std::string label,
                                  std::optional<std::uint16_t> recipeId) {
  operationKind_ = kind;
  operationState_ = MachineOperationState::RUNNING;
  operationStartedAtUs_ = esp_timer_get_time();
  operationDurationMs_ = durationMs;
  operationRecipeId_ = recipeId;
  operationLabel_ = std::move(label);
}

MachineStatus MachineLogic::getStatus() {
  refreshOperationState();

  std::uint8_t progress = 0;
  if (operationState_ == MachineOperationState::FINISHED) {
    progress = 100;
  } else if (operationState_ == MachineOperationState::RUNNING &&
             operationDurationMs_ > 0) {
    const std::int64_t elapsedUs = esp_timer_get_time() - operationStartedAtUs_;
    const std::uint64_t elapsedMs =
        elapsedUs > 0 ? static_cast<std::uint64_t>(elapsedUs / 1000) : 0;
    progress = static_cast<std::uint8_t>(
        std::min<std::uint64_t>(99, elapsedMs * 100 / operationDurationMs_));
  }

  return {.kind = operationKind_,
          .state = operationState_,
          .progress = progress,
          .recipeId = operationRecipeId_,
          .label = operationLabel_};
}

void MachineLogic::setEventCallback(EventCallback callback) {
  eventCallback_ = std::move(callback);
}

void MachineLogic::emitEvent(MachineEvent event,
                             std::optional<std::uint8_t> pumpId) {
  if (eventCallback_) {
    eventCallback_(event, pumpId);
  }
}

DeviceSettings MachineLogic::getDeviceSettings() const {
  return deviceSettings_;
}

bool MachineLogic::updateDeviceSettings(const DeviceSettings &settings) {
  if (!deviceSettingsRepository_.save(settings)) {
    return false;
  }
  deviceSettings_ = settings;
  synchronizePumpLeds();
  return true;
}

StartRecipeResult
MachineLogic::startRecipe(std::uint16_t recipeId,
                          const std::vector<RecipeItem> &overrides) {
  if (isOperationBusy()) {
    return StartRecipeResult::MACHINE_BUSY;
  }

  std::optional<RecipeConfig> recipe = recipeRepository_.findById(recipeId);
  if (!recipe.has_value()) {
    return StartRecipeResult::RECIPE_NOT_FOUND;
  }

  if (!sensorHandling_.isGlassPresent()) {
    feedbackControl_.playError();
    return StartRecipeResult::NO_GLASS;
  }

  RecipeConfig effectiveRecipe = *recipe;
  for (const RecipeItem &overrideItem : overrides) {
    const auto existingItem =
        std::find_if(effectiveRecipe.items.begin(), effectiveRecipe.items.end(),
                     [&overrideItem](const RecipeItem &item) {
                       return item.ingredientId == overrideItem.ingredientId;
                     });

    if (existingItem != effectiveRecipe.items.end()) {
      existingItem->amountMl = overrideItem.amountMl;
    } else if (overrideItem.amountMl > 0) {
      effectiveRecipe.items.push_back(overrideItem);
    }
  }

  struct DispenseItem {
    std::uint8_t pumpId;
    std::uint16_t amountMl;
    std::uint64_t durationMs;
  };

  std::vector<DispenseItem> dispensingPlan;
  dispensingPlan.reserve(effectiveRecipe.items.size());

  for (const RecipeItem &item : effectiveRecipe.items) {
    if (item.amountMl == 0) {
      continue;
    }

    const std::optional<std::uint8_t> pumpId =
        pumpControl_.findPumpIdByIngredientId(item.ingredientId);
    if (!pumpId.has_value()) {
      return StartRecipeResult::INGREDIENT_NOT_AVAILABLE;
    }

    const std::optional<PumpConfig> pumpConfig =
        pumpRepository_.findById(*pumpId);
    if (!pumpConfig || !pumpConfig->mlPerSec || *pumpConfig->mlPerSec <= 0) {
      return StartRecipeResult::PUMP_NOT_CALIBRATED;
    }

    const std::uint64_t durationMs = static_cast<std::uint64_t>(
        std::ceil(item.amountMl / *pumpConfig->mlPerSec * 1000.0f));
    dispensingPlan.push_back({.pumpId = *pumpId,
                              .amountMl = item.amountMl,
                              .durationMs = durationMs});
  }

  for (const DispenseItem &item : dispensingPlan) {
    const PumpResult result = pumpControl_.validatePump(item.pumpId);
    if (result == PumpResult::NOT_CALIBRATED) {
      return StartRecipeResult::PUMP_NOT_CALIBRATED;
    }
    if (result != PumpResult::SUCCESS) {
      return StartRecipeResult::START_FAILED;
    }
  }

  bool pumpStarted = false;
  for (const DispenseItem &item : dispensingPlan) {
    const PumpResult result =
        pumpControl_.startPump(item.pumpId, item.amountMl);
    if (result == PumpResult::SUCCESS) {
      pumpStarted = true;
      continue;
    }

    if (pumpStarted) {
      pumpControl_.stopAllPumps();
    }

    if (result == PumpResult::NOT_CALIBRATED) {
      return StartRecipeResult::PUMP_NOT_CALIBRATED;
    }
    return StartRecipeResult::START_FAILED;
  }

  pendingBottleConsumption_.clear();
  for (const DispenseItem &item : dispensingPlan) {
    const auto existing = std::find_if(
        pendingBottleConsumption_.begin(), pendingBottleConsumption_.end(),
        [&item](const BottleConsumption &consumption) {
          return consumption.pumpId == item.pumpId;
        });
    if (existing == pendingBottleConsumption_.end()) {
      pendingBottleConsumption_.push_back(
          {.pumpId = item.pumpId,
           .amountMl = static_cast<float>(item.amountMl)});
    } else {
      existing->amountMl += item.amountMl;
    }
  }

  std::uint64_t operationDurationMs = 1;
  for (const DispenseItem &item : dispensingPlan) {
    operationDurationMs = std::max(operationDurationMs, item.durationMs);
  }
  beginOperation(MachineOperationKind::DRINK, operationDurationMs, recipe->name,
                 recipeId);
  return StartRecipeResult::SUCCESS;
}

MachineActionResult MachineLogic::startCleaningPump(std::uint8_t pumpId) {
  if (isOperationBusy()) {
    return MachineActionResult::MACHINE_BUSY;
  }

  const PumpResult result =
      pumpControl_.startPumpForDuration(pumpId, MAX_CLEANING_DURATION_MS);
  if (result == PumpResult::SUCCESS) {
    beginOperation(MachineOperationKind::CLEANING, MAX_CLEANING_DURATION_MS,
                   "Rinsing pump " + std::to_string(pumpId));
    return MachineActionResult::SUCCESS;
  }
  return result == PumpResult::PUMP_NOT_FOUND
             ? MachineActionResult::PUMP_NOT_FOUND
             : MachineActionResult::START_FAILED;
}

MachineActionResult MachineLogic::startCleaningAllPumps() {
  if (isOperationBusy()) {
    return MachineActionResult::MACHINE_BUSY;
  }
  if (pumpRepository_.loadAll().empty()) {
    return MachineActionResult::PUMP_NOT_FOUND;
  }

  pumpControl_.startAllPumpsForDuration(MAX_CLEANING_DURATION_MS);
  beginOperation(MachineOperationKind::CLEANING, MAX_CLEANING_DURATION_MS,
                 "Rinsing all pumps");
  return MachineActionResult::SUCCESS;
}

MachineActionResult
MachineLogic::startCalibrationPump(std::uint8_t pumpId,
                                   std::uint64_t durationMs) {
  if (isOperationBusy()) {
    return MachineActionResult::MACHINE_BUSY;
  }
  if (durationMs == 0 || durationMs > 120000) {
    return MachineActionResult::INVALID_AMOUNT;
  }

  const PumpResult result =
      pumpControl_.startPumpForDuration(pumpId, durationMs);
  if (result != PumpResult::SUCCESS) {
    return result == PumpResult::PUMP_NOT_FOUND
               ? MachineActionResult::PUMP_NOT_FOUND
               : MachineActionResult::START_FAILED;
  }

  currentCalibrationPumpId_ = pumpId;
  currentCalibrationDurationMs_ = durationMs;
  beginOperation(MachineOperationKind::CALIBRATION, durationMs,
                 "Calibrating pump " + std::to_string(pumpId));
  return MachineActionResult::SUCCESS;
}

MachineActionResult
MachineLogic::finishedCalibrationPump(std::uint64_t measuredMl) {
  refreshOperationState();
  if (operationKind_ != MachineOperationKind::CALIBRATION ||
      operationState_ != MachineOperationState::FINISHED ||
      currentCalibrationDurationMs_ == 0) {
    return MachineActionResult::OPERATION_NOT_READY;
  }
  if (measuredMl == 0) {
    return MachineActionResult::INVALID_AMOUNT;
  }

  const float mlPerSec = (static_cast<float>(measuredMl) * 1000.0f) /
                         static_cast<float>(currentCalibrationDurationMs_);
  std::optional<PumpConfig> pump =
      pumpRepository_.findById(currentCalibrationPumpId_);
  if (!pump) {
    return MachineActionResult::PUMP_NOT_FOUND;
  }

  const PumpConfig previous = *pump;
  pump->mlPerSec = mlPerSec;
  if (!pumpRepository_.update(*pump)) {
    return MachineActionResult::PERSISTENCE_FAILED;
  }

  const PumpResult result = pumpControl_.updatePump(*pump);
  if (result != PumpResult::SUCCESS) {
    pumpRepository_.update(previous);
    return MachineActionResult::START_FAILED;
  }

  operationKind_ = MachineOperationKind::NONE;
  operationState_ = MachineOperationState::IDLE;
  operationStartedAtUs_ = 0;
  operationDurationMs_ = 0;
  operationRecipeId_.reset();
  operationLabel_.clear();
  currentCalibrationDurationMs_ = 0;
  return MachineActionResult::SUCCESS;
}

void MachineLogic::stopCurrentOperation() {
  pumpControl_.stopAllPumps();
  operationState_ = MachineOperationState::STOPPED;
  operationDurationMs_ = 0;
  currentCalibrationDurationMs_ = 0;
  pendingBottleConsumption_.clear();
  synchronizePumpLeds();
}
