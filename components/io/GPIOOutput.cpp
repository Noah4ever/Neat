
#include "io/GPIOOutput.hpp"

GPIOOutput::GPIOOutput(gpio_num_t pin)
    : pin(pin)
{
  gpio_reset_pin(pin);
  gpio_set_direction(pin, GPIO_MODE_OUTPUT);

  // inital state
  gpio_set_level(pin, 0);
}

void GPIOOutput::set(bool state) {
  gpio_set_level(pin, state ? 1 : 0);
}