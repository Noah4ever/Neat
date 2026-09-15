#pragma once

#include "driver/gpio.h"
#include "soc/gpio_num.h"

namespace Pins {

// Sensor
constexpr gpio_num_t GLASS_SENSOR = GPIO_NUM_23;

// Bottle LEDs
constexpr gpio_num_t BOTTLE_LED_1 = GPIO_NUM_0;
constexpr gpio_num_t BOTTLE_LED_2 = GPIO_NUM_1;
constexpr gpio_num_t BOTTLE_LED_3 = GPIO_NUM_2;
constexpr gpio_num_t BOTTLE_LED_4 = GPIO_NUM_3;
constexpr gpio_num_t BOTTLE_LED_5 = GPIO_NUM_21;
constexpr gpio_num_t BOTTLE_LED_6 = GPIO_NUM_22;

// Buzzer
constexpr gpio_num_t BUZZER = GPIO_NUM_20;

} // namespace Pins