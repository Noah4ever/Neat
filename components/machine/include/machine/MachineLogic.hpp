#pragma once

#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <vector>

#include "bottle/BottleStateRepository.hpp"
#include "feedback/FeedbackControl.hpp"
#include "machine/MachineEvent.hpp"
#include "pump/PumpControl.hpp"
#include "recipe/RecipeConfig.hpp"
#include "recipe/RecipeResults.hpp"
#include "sensor/SensorHandling.hpp"
#include "settings/DeviceSettings.hpp"
#include "settings/DeviceSettingsRepository.hpp"
#include "storage/PumpConfigRepository.hpp"
#include "storage/RecipeConfigRepository.hpp"

enum class MachineOperationKind { NONE, DRINK, CLEANING, CALIBRATION };

enum class MachineOperationState { IDLE, RUNNING, FINISHED, STOPPED };

struct MachineStatus {
  MachineOperationKind kind;
  MachineOperationState state;
  std::uint8_t progress;
  std::optional<std::uint16_t> recipeId;
  std::string label;
};

enum class MachineActionResult {
  SUCCESS,
  MACHINE_BUSY,
  PUMP_NOT_FOUND,
  INVALID_AMOUNT,
  OPERATION_NOT_READY,
  PERSISTENCE_FAILED,
  START_FAILED
};

class MachineLogic {
public:
  MachineLogic(PumpControl &pumpControl,
               RecipeConfigRepository &recipeRepository,
               PumpConfigRepository &pumpRepository,
               SensorHandling &sensorHandling,
               FeedbackControl &feedbackControl,
               DeviceSettingsRepository &deviceSettingsRepository,
               BottleStateRepository &bottleStateRepository);
  void update();
  void init();
  MachineStatus getStatus();

  using EventCallback =
      std::function<void(MachineEvent, std::optional<std::uint8_t>)>;
  void setEventCallback(EventCallback callback);

  DeviceSettings getDeviceSettings() const;
  bool updateDeviceSettings(const DeviceSettings &settings);

  StartRecipeResult startRecipe(std::uint16_t recipeId,
                                const std::vector<RecipeItem> &overrides);

  MachineActionResult startCleaningPump(std::uint8_t pumpId);
  MachineActionResult startCleaningAllPumps();

  MachineActionResult startCalibrationPump(std::uint8_t pumpId,
                                           std::uint64_t durationMs);
  MachineActionResult finishedCalibrationPump(std::uint64_t measuredMl);

  void stopCurrentOperation();

private:
  PumpControl &pumpControl_;
  RecipeConfigRepository &recipeRepository_;
  PumpConfigRepository &pumpRepository_;
  SensorHandling &sensorHandling_;
  FeedbackControl &feedbackControl_;
  DeviceSettingsRepository &deviceSettingsRepository_;
  BottleStateRepository &bottleStateRepository_;
  DeviceSettings deviceSettings_;

  struct BottleConsumption {
    std::uint8_t pumpId;
    float amountMl;
  };
  std::vector<BottleConsumption> pendingBottleConsumption_;

  std::uint8_t currentCalibrationPumpId_;
  std::uint64_t currentCalibrationDurationMs_;

  EventCallback eventCallback_;
  void emitEvent(MachineEvent event,
                 std::optional<std::uint8_t> pumpId = std::nullopt);

  MachineOperationKind operationKind_ = MachineOperationKind::NONE;
  MachineOperationState operationState_ = MachineOperationState::IDLE;
  std::int64_t operationStartedAtUs_ = 0;
  std::uint64_t operationDurationMs_ = 0;
  std::optional<std::uint16_t> operationRecipeId_;
  std::string operationLabel_;

  void refreshOperationState();
  void finishDrinkSuccessfully();
  void synchronizePumpLeds();
  bool isOperationBusy();
  void beginOperation(MachineOperationKind kind, std::uint64_t durationMs,
                      std::string label,
                      std::optional<std::uint16_t> recipeId = std::nullopt);

  static constexpr std::uint64_t MAX_CLEANING_DURATION_MS = 60000;
};
