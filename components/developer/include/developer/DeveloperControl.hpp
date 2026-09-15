#pragma once

#include <cstdint>

class FeedbackControl;
class MachineLogic;
class PumpControl;
class SensorHandling;

enum class DeveloperResult {
  SUCCESS,
  MACHINE_BUSY,
  PUMP_NOT_FOUND,
  INVALID_DURATION
};

class DeveloperControl {
public:
  DeveloperControl(MachineLogic &machineLogic, PumpControl &pumpControl,
                   SensorHandling &sensorHandling,
                   FeedbackControl &feedbackControl);

  bool glassPresent();
  DeveloperResult testPump(std::uint8_t pumpId, std::uint32_t durationMs);
  DeveloperResult stopPump(std::uint8_t pumpId);
  void stopAllPumps();
  bool setPumpLed(std::uint8_t pumpId, bool state);
  void resetPumpLeds();
  void playSuccess();
  void playError();
  void stopBuzzer();

private:
  bool machineBusy();

  MachineLogic &machineLogic_;
  PumpControl &pumpControl_;
  SensorHandling &sensorHandling_;
  FeedbackControl &feedbackControl_;
};
