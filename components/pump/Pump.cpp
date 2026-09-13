#include "pump/Pump.hpp"

#include <cstdint>
#include <utility>

#include "esp_timer.h"

Pump::Pump(std::uint8_t id, std::unique_ptr<OutputChannel> output)
    : id_(id), output_(std::move(output)), stopAtUs_(0), running_(false) {}

void Pump::update() {
  if (running_ && esp_timer_get_time() >= stopAtUs_) {
    stop();
  }
}

void Pump::startFor(std::int64_t durationUs) {
  output_->set(true);

  stopAtUs_ = esp_timer_get_time() + durationUs;
  running_ = true;
}

void Pump::stop() {
  output_->set(false);

  running_ = false;
  stopAtUs_ = 0;
}

void Pump::setIngredientId(std::optional<std::uint16_t> ingredientId) {
  ingredientId_ = ingredientId;
}

void Pump::setCalibration(float flowRateMlPerSecond) {
  calibration_.emplace(flowRateMlPerSecond);
}

std::uint8_t Pump::id() const { return id_; }

bool Pump::isRunning() const { return running_; }

bool Pump::isCalibrated() const { return calibration_.has_value(); }

std::optional<float> Pump::getFlowRate() const {
  if (!calibration_) {
    return std::nullopt;
  }

  return calibration_->getFlowRate();
}

std::optional<uint16_t> Pump::getIngredientId() const { return ingredientId_; }