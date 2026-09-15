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

  void stopSound();

private:
  struct Tone {
    std::uint16_t frequencyHz;
    std::uint16_t durationMs;
  };

  static constexpr std::array<Tone, 2> SUCCESS_MELODY = {{
      {900, 100},
      {1400, 180},
  }};

  static constexpr std::array<Tone, 2> ERROR_MELODY = {{
      {500, 180},
      {300, 300},
  }};

  std::vector<PumpLedMapping> pumpLedMappings_;
  Buzzer buzzer_;
  bool testLedOverrideActive_ = false;

  const Tone *currentMelody_ = nullptr;
  std::size_t currentMelodySize_ = 0;
  std::size_t currentToneIndex_ = 0;

  void startMelody(const Tone *melody, std::size_t size);
  void startCurrentTone();
};
