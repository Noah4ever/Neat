#pragma once

#include <cstdint>

#include "driver/gpio.h"

class Buzzer {
public:
  explicit Buzzer(gpio_num_t pin);

  void playTone(std::uint16_t frequencyHz, std::uint16_t durationMs);

  void stop();
  void update();

  bool isPlaying() const;

private:
  gpio_num_t pin_;

  bool playing_ = false;
  std::int64_t stopAtUs_ = 0;
};