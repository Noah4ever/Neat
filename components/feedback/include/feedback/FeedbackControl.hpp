#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <vector>

#include "driver/gpio.h"
#include "io/Buzzer.hpp"
#include "io/LED.hpp"
#include "io/OutputChannel.hpp"
#include "settings/DeviceSettings.hpp"

struct PumpLedMapping {
  std::uint8_t pumpId;
  LED led;
};

class FeedbackControl {
public:
  FeedbackControl(std::vector<PumpLedMapping> pumpLedMappings,
                  gpio_num_t buzzerPin);

  void update();

  void setPumpLed(std::uint8_t pumpId, bool state);
  void turnOffAllPumpLeds();
  bool setTestPumpLed(std::uint8_t pumpId, bool state);
  void resetTestPumpLeds();

  void playSuccess();
  void playError();
  void setSounds(const std::vector<BuzzerTone> &success,
                 const std::vector<BuzzerTone> &error);

  void stopSound();

private:
  std::vector<PumpLedMapping> pumpLedMappings_;
  Buzzer buzzer_;
  bool testLedOverrideActive_ = false;

  std::vector<BuzzerTone> successMelody_ = {{880, 90}, {1319, 140}};
  std::vector<BuzzerTone> errorMelody_ = {{440, 130}, {330, 210}};
  const BuzzerTone *currentMelody_ = nullptr;
  std::size_t currentMelodySize_ = 0;
  std::size_t currentToneIndex_ = 0;

  void startMelody(const BuzzerTone *melody, std::size_t size);
  void startCurrentTone();
};
