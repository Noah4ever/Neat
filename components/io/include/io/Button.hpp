#pragma once

#include "driver/gpio.h"
#include "soc/gpio_num.h"

class Button {
public:
  Button(gpio_num_t pin);

  bool getState();

private:
  gpio_num_t pin_;
};