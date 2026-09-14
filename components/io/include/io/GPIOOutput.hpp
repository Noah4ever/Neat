#pragma once

#include "OutputChannel.hpp"
#include "driver/gpio.h"

class GPIOOutput : public OutputChannel {
public:
  GPIOOutput(gpio_num_t pin);
  void set(bool state) override;

private:
  gpio_num_t pin;
};