#include "io/Buzzer.hpp"

#include "driver/ledc.h"
#include "esp_err.h"
#include "esp_timer.h"

namespace {

constexpr ledc_mode_t SPEED_MODE = LEDC_LOW_SPEED_MODE;
constexpr ledc_timer_t TIMER = LEDC_TIMER_0;
constexpr ledc_channel_t CHANNEL = LEDC_CHANNEL_0;

constexpr ledc_timer_bit_t DUTY_RESOLUTION = LEDC_TIMER_10_BIT;

constexpr std::uint32_t DUTY_MAX = (1U << 10U) - 1U;
constexpr std::uint32_t DUTY_HALF = DUTY_MAX / 2U;

constexpr std::uint32_t INITIAL_FREQUENCY_HZ = 1000;

} // namespace

Buzzer::Buzzer(gpio_num_t pin) : pin_(pin) {

  ledc_timer_config_t timerConfig = {};
  timerConfig.speed_mode = SPEED_MODE;
  timerConfig.duty_resolution = DUTY_RESOLUTION;
  timerConfig.timer_num = TIMER;
  timerConfig.freq_hz = INITIAL_FREQUENCY_HZ;
  timerConfig.clk_cfg = LEDC_AUTO_CLK;

  ESP_ERROR_CHECK(ledc_timer_config(&timerConfig));

  ledc_channel_config_t channelConfig = {};
  channelConfig.gpio_num = pin_;
  channelConfig.speed_mode = SPEED_MODE;
  channelConfig.channel = CHANNEL;
  channelConfig.intr_type = LEDC_INTR_DISABLE;
  channelConfig.timer_sel = TIMER;
  channelConfig.duty = 0;
  channelConfig.hpoint = 0;

  ESP_ERROR_CHECK(ledc_channel_config(&channelConfig));
}

void Buzzer::playTone(std::uint16_t frequencyHz, std::uint16_t durationMs) {
  if (frequencyHz == 0 || durationMs == 0) {
    stop();
    return;
  }

  ledc_set_freq(SPEED_MODE, TIMER, frequencyHz);

  ledc_set_duty(SPEED_MODE, CHANNEL, DUTY_HALF);
  ledc_update_duty(SPEED_MODE, CHANNEL);

  stopAtUs_ =
      esp_timer_get_time() + static_cast<std::int64_t>(durationMs) * 1000;

  playing_ = true;
}

void Buzzer::stop() {
  ledc_set_duty(SPEED_MODE, CHANNEL, 0);
  ledc_update_duty(SPEED_MODE, CHANNEL);

  playing_ = false;
  stopAtUs_ = 0;
}

void Buzzer::update() {
  if (!playing_) {
    return;
  }

  if (esp_timer_get_time() >= stopAtUs_) {
    stop();
  }
}

bool Buzzer::isPlaying() const { return playing_; }