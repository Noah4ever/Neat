#pragma once

#include "driver/gpio.h"

namespace Pins {

constexpr gpio_num_t GLASS_SENSOR = GPIO_NUM_5;

constexpr gpio_num_t BOTTLE_LED_1 = GPIO_NUM_6;
constexpr gpio_num_t BOTTLE_LED_2 = GPIO_NUM_7;
constexpr gpio_num_t BOTTLE_LED_3 = GPIO_NUM_8;
constexpr gpio_num_t BOTTLE_LED_4 = GPIO_NUM_9;
constexpr gpio_num_t BOTTLE_LED_5 = GPIO_NUM_10;
constexpr gpio_num_t BOTTLE_LED_6 = GPIO_NUM_11;

constexpr gpio_num_t BUZZER = GPIO_NUM_12;

} // namespace Pins