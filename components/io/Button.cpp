#include "io/Button.hpp"

Button::Button(gpio_num_t pin) : pin_(pin) {
  gpio_reset_pin(pin_);
  gpio_set_direction(pin_, GPIO_MODE_INPUT);
  gpio_set_pull_mode(pin_, GPIO_PULLUP_ONLY);
}

// pressed = true
bool Button::getState() { return gpio_get_level(pin_) == 0; }