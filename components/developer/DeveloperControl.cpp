#include "developer/DeveloperControl.hpp"

#include "feedback/FeedbackControl.hpp"
#include "machine/MachineLogic.hpp"
#include "pump/PumpControl.hpp"
#include "sensor/SensorHandling.hpp"

DeveloperControl::DeveloperControl(
    MachineLogic &machineLogic, PumpControl &pumpControl,
    SensorHandling &sensorHandling, FeedbackControl &feedbackControl)
    : machineLogic_(machineLogic), pumpControl_(pumpControl),
      sensorHandling_(sensorHandling), feedbackControl_(feedbackControl) {}

bool DeveloperControl::machineBusy() {
  const MachineStatus status = machineLogic_.getStatus();
  return status.state == MachineOperationState::RUNNING ||
         status.state == MachineOperationState::PAUSED ||
         (status.kind == MachineOperationKind::CALIBRATION &&
          status.state == MachineOperationState::FINISHED);
}

bool DeveloperControl::glassPresent() {
  return sensorHandling_.isGlassPresent();
}

DeveloperResult DeveloperControl::testPump(std::uint8_t pumpId,
                                           std::uint32_t durationMs) {
  if (durationMs == 0 || durationMs > 5000) {
    return DeveloperResult::INVALID_DURATION;
  }
  if (machineBusy()) return DeveloperResult::MACHINE_BUSY;
  const PumpResult result = pumpControl_.startPumpForDuration(pumpId, durationMs);
  return result == PumpResult::SUCCESS ? DeveloperResult::SUCCESS
         : result == PumpResult::PUMP_NOT_FOUND
             ? DeveloperResult::PUMP_NOT_FOUND
             : DeveloperResult::INVALID_DURATION;
}

DeveloperResult DeveloperControl::stopPump(std::uint8_t pumpId) {
  return pumpControl_.stopPump(pumpId) == PumpResult::SUCCESS
             ? DeveloperResult::SUCCESS
             : DeveloperResult::PUMP_NOT_FOUND;
}

void DeveloperControl::stopAllPumps() { pumpControl_.stopAllPumps(); }

bool DeveloperControl::setPumpLed(std::uint8_t pumpId, bool state) {
  return feedbackControl_.setTestPumpLed(pumpId, state);
}

void DeveloperControl::resetPumpLeds() {
  feedbackControl_.resetTestPumpLeds();
}

void DeveloperControl::playSuccess() { feedbackControl_.playSuccess(); }
void DeveloperControl::playError() { feedbackControl_.playError(); }
void DeveloperControl::stopBuzzer() { feedbackControl_.stopSound(); }
