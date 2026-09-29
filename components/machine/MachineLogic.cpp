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
                           IngredientConfigRepository &ingredientRepository,
                           PumpConfigRepository &pumpRepository,
                           SensorHandling &sensorHandling,
                           FeedbackControl &feedbackControl,
                           DeviceSettingsRepository &deviceSettingsRepository,
                           BottleStateRepository &bottleStateRepository)
    : pumpControl_(pumpControl), recipeRepository_(recipeRepository),
      ingredientRepository_(ingredientRepository),
      pumpRepository_(pumpRepository), sensorHandling_(sensorHandling),
      feedbackControl_(feedbackControl),
      deviceSettingsRepository_(deviceSettingsRepository),
      bottleStateRepository_(bottleStateRepository),
      deviceSettings_(deviceSettingsRepository.load()),
      currentCalibrationPumpId_(0),
      currentCalibrationDurationMs_(0) {}

void MachineLogic::init() {
  feedbackControl_.setSounds(deviceSettings_.successSound, deviceSettings_.errorSound);
}

void MachineLogic::update() {
  pumpControl_.update();
  refreshOperationState();

  if (operationKind_ == MachineOperationKind::DRINK &&
      operationState_ == MachineOperationState::RUNNING &&
      deviceSettings_.requireGlassDetection &&
      !ignoreGlassForCurrentDrink_ &&
      !sensorHandling_.isGlassPresent()) {
    pauseCurrentDrink();
  }

  synchronizePumpLeds();
}

void MachineLogic::refreshOperationState() {
  if (operationState_ == MachineOperationState::RUNNING &&
      operationDurationMs_ > 0 &&
      elapsedOperationMs() >= operationDurationMs_) {

    operationState_ = MachineOperationState::FINISHED;

    if (operationKind_ == MachineOperationKind::DRINK) {
      finishDrinkSuccessfully();
    }
  }
}

std::uint64_t MachineLogic::elapsedOperationMs() const {
  if (operationState_ != MachineOperationState::RUNNING) {
    return operationElapsedMs_;
  }
  const std::int64_t elapsedUs = esp_timer_get_time() - operationStartedAtUs_;
  const std::uint64_t currentMs =
      elapsedUs > 0 ? static_cast<std::uint64_t>(elapsedUs / 1000) : 0;
  return std::min(operationDurationMs_, operationElapsedMs_ + currentMs);
}

void MachineLogic::pauseCurrentDrink() {
  operationElapsedMs_ = elapsedOperationMs();
  pumpControl_.stopAllPumps();
  operationState_ = MachineOperationState::PAUSED;
  feedbackControl_.playError();
  emitEvent(MachineEvent::GLASS_REMOVED);
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
         operationState_ == MachineOperationState::PAUSED ||
         (operationKind_ == MachineOperationKind::CALIBRATION &&
          operationState_ == MachineOperationState::FINISHED);
}

void MachineLogic::beginOperation(MachineOperationKind kind,
                                  std::uint64_t durationMs, std::string label,
                                  std::optional<std::uint16_t> recipeId) {
  if (kind != MachineOperationKind::DRINK) {
    activeDispensePlan_.clear();
  }
  operationKind_ = kind;
  operationState_ = MachineOperationState::RUNNING;
  operationStartedAtUs_ = esp_timer_get_time();
  operationDurationMs_ = durationMs;
  operationElapsedMs_ = 0;
  operationRecipeId_ = recipeId;
  operationLabel_ = std::move(label);
  ignoreGlassForCurrentDrink_ = false;
}

MachineStatus MachineLogic::getStatus() {
  refreshOperationState();

  std::uint8_t progress = 0;
  if (operationState_ == MachineOperationState::FINISHED) {
    progress = 100;
  } else if (operationState_ == MachineOperationState::RUNNING &&
             operationDurationMs_ > 0) {
    progress = static_cast<std::uint8_t>(
        std::min<std::uint64_t>(99, elapsedOperationMs() * 100 /
                                       operationDurationMs_));
  } else if (operationState_ == MachineOperationState::PAUSED &&
             operationDurationMs_ > 0) {
    progress = static_cast<std::uint8_t>(
        std::min<std::uint64_t>(99, operationElapsedMs_ * 100 /
                                       operationDurationMs_));
  }

  std::vector<std::uint16_t> completedIngredientIds;
  const std::uint64_t elapsedMs = elapsedOperationMs();
  for (const ActiveDispense &item : activeDispensePlan_) {
    if (elapsedMs >= item.durationMs &&
        std::find(completedIngredientIds.begin(),
                  completedIngredientIds.end(), item.ingredientId) ==
            completedIngredientIds.end()) {
      completedIngredientIds.push_back(item.ingredientId);
    }
  }

  return {.kind = operationKind_,
          .state = operationState_,
          .progress = progress,
          .recipeId = operationRecipeId_,
          .label = operationLabel_,
          .glassPresent = sensorHandling_.isGlassPresent(),
          .completedIngredientIds = std::move(completedIngredientIds)};
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
  feedbackControl_.setSounds(settings.successSound, settings.errorSound);
  synchronizePumpLeds();
  return true;
}

RecipeAvailability
MachineLogic::getRecipeAvailability(const RecipeConfig &recipe) {
  return RecipePlanner::availability(recipe.items, pumpRepository_.loadAll());
}

bool MachineLogic::isStrengthAdjustmentAvailable(const RecipeConfig &recipe) {
  return RecipePlanner::strengthAdjustmentAvailable(
      recipe, ingredientRepository_.loadAll());
}

StartRecipeResult
MachineLogic::startRecipe(std::uint16_t recipeId,
                          std::uint16_t sizeMl,
                          DrinkStrength strength,
                          const std::vector<RecipeItem> &overrides,
                          bool ignoreGlass) {
  if (isOperationBusy()) {
    return StartRecipeResult::MACHINE_BUSY;
  }

  std::optional<RecipeConfig> recipe = recipeRepository_.findById(recipeId);
  if (!recipe.has_value()) {
    return StartRecipeResult::RECIPE_NOT_FOUND;
  }

  if (deviceSettings_.requireGlassDetection && !ignoreGlass &&
      !sensorHandling_.isGlassPresent()) {
    feedbackControl_.playError();
    return StartRecipeResult::NO_GLASS;
  }

  std::vector<RecipeItem> effectiveItems;
  const RecipeCalculationResult calculation = RecipePlanner::calculate(
      *recipe, ingredientRepository_.loadAll(), deviceSettings_, sizeMl,
      strength, overrides, effectiveItems);
  if (calculation == RecipeCalculationResult::INVALID_SIZE) {
    return StartRecipeResult::INVALID_SIZE;
  }
  if (calculation == RecipeCalculationResult::STRENGTH_NOT_SUPPORTED) {
    return StartRecipeResult::STRENGTH_NOT_SUPPORTED;
  }
  if (calculation != RecipeCalculationResult::SUCCESS) {
    return StartRecipeResult::INVALID_OVERRIDE;
  }

  const std::vector<PumpConfig> pumpConfigs = pumpRepository_.loadAll();
  const RecipeAvailability availability =
      RecipePlanner::availability(effectiveItems, pumpConfigs);
  if (!availability.missingIngredientIds.empty()) {
    return StartRecipeResult::INGREDIENT_NOT_AVAILABLE;
  }
  if (!availability.uncalibratedIngredientIds.empty()) {
    return StartRecipeResult::PUMP_NOT_CALIBRATED;
  }

  struct DispenseItem {
    std::uint8_t pumpId;
    std::uint16_t ingredientId;
    std::uint16_t amountMl;
    std::uint64_t durationMs;
  };

  std::vector<DispenseItem> dispensingPlan;
  dispensingPlan.reserve(effectiveItems.size());

  for (const RecipeItem &item : effectiveItems) {
    if (!item.machineDispensed) continue;
    if (item.amountMl == 0) {
      continue;
    }

    const auto pumpConfig = std::find_if(
        pumpConfigs.begin(), pumpConfigs.end(), [&item](const PumpConfig &pump) {
          return pump.ingredientId && *pump.ingredientId == item.ingredientId &&
                 pump.mlPerSec && *pump.mlPerSec > 0.0f;
        });
    if (pumpConfig == pumpConfigs.end()) {
      return StartRecipeResult::INGREDIENT_NOT_AVAILABLE;
    }

    const std::uint64_t durationMs = static_cast<std::uint64_t>(
        std::ceil(item.amountMl / *pumpConfig->mlPerSec * 1000.0f));
    dispensingPlan.push_back({.pumpId = pumpConfig->id,
                              .ingredientId = item.ingredientId,
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

  for (const BottleConsumption &consumption : pendingBottleConsumption_) {
    const std::optional<BottleState> bottle =
        bottleStateRepository_.findByPumpId(consumption.pumpId);
    if (bottle && bottle->remainingMl < consumption.amountMl) {
      emitEvent(MachineEvent::BOTTLE_MAY_BE_EMPTY, consumption.pumpId);
    }
  }

  std::uint64_t operationDurationMs = 1;
  for (const DispenseItem &item : dispensingPlan) {
    operationDurationMs = std::max(operationDurationMs, item.durationMs);
  }
  activeDispensePlan_.clear();
  for (const DispenseItem &item : dispensingPlan) {
    activeDispensePlan_.push_back(
        {.pumpId = item.pumpId,
         .ingredientId = item.ingredientId,
         .durationMs = item.durationMs});
  }
  beginOperation(MachineOperationKind::DRINK, operationDurationMs, recipe->name,
                 recipeId);
  ignoreGlassForCurrentDrink_ = ignoreGlass;
  return StartRecipeResult::SUCCESS;
}

MachineActionResult MachineLogic::resumeCurrentOperation(bool ignoreGlass) {
  if (operationKind_ != MachineOperationKind::DRINK ||
      operationState_ != MachineOperationState::PAUSED) {
    return MachineActionResult::OPERATION_NOT_READY;
  }
  if (deviceSettings_.requireGlassDetection && !ignoreGlass &&
      !sensorHandling_.isGlassPresent()) {
    return MachineActionResult::GLASS_NOT_PRESENT;
  }

  for (const ActiveDispense &item : activeDispensePlan_) {
    if (item.durationMs <= operationElapsedMs_) {
      continue;
    }
    if (pumpControl_.startPumpForDuration(
            item.pumpId, item.durationMs - operationElapsedMs_) !=
        PumpResult::SUCCESS) {
      pumpControl_.stopAllPumps();
      return MachineActionResult::START_FAILED;
    }
  }
  operationStartedAtUs_ = esp_timer_get_time();
  operationState_ = MachineOperationState::RUNNING;
  ignoreGlassForCurrentDrink_ = ignoreGlass;
  return MachineActionResult::SUCCESS;
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
MachineLogic::finishedCalibrationPump(float measuredMl) {
  refreshOperationState();
  if (operationKind_ != MachineOperationKind::CALIBRATION ||
      operationState_ != MachineOperationState::FINISHED ||
      currentCalibrationDurationMs_ == 0) {
    return MachineActionResult::OPERATION_NOT_READY;
  }
  if (!std::isfinite(measuredMl) || measuredMl <= 0.0f) {
    return MachineActionResult::INVALID_AMOUNT;
  }

  const float mlPerSec = (measuredMl * 1000.0f) /
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
  operationElapsedMs_ = 0;
  operationRecipeId_.reset();
  operationLabel_.clear();
  currentCalibrationDurationMs_ = 0;
  activeDispensePlan_.clear();
  ignoreGlassForCurrentDrink_ = false;
  return MachineActionResult::SUCCESS;
}

void MachineLogic::stopCurrentOperation() {
  pumpControl_.stopAllPumps();
  operationState_ = MachineOperationState::STOPPED;
  operationDurationMs_ = 0;
  operationElapsedMs_ = 0;
  currentCalibrationDurationMs_ = 0;
  pendingBottleConsumption_.clear();
  activeDispensePlan_.clear();
  ignoreGlassForCurrentDrink_ = false;
  synchronizePumpLeds();
}
