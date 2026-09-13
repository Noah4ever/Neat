#pragma once

#include <cstdint>
#include <memory>
#include <optional>

#include "io/OutputChannel.hpp"
#include "pump/Calibration.hpp"

class Pump {
public:
  Pump(std::uint8_t id, std::unique_ptr<OutputChannel> output);

  void update();

  void startFor(std::int64_t durationUs);
  void stop();

  void setIngredientId(std::optional<std::uint16_t> ingredientId);
  void setCalibration(float flowRateMlPerSecond);

  std::uint8_t id() const;
  bool isRunning() const;
  bool isCalibrated() const;

  std::optional<float> getFlowRate() const;
  std::optional<uint16_t> getIngredientId() const;

private:
  std::uint8_t id_;
  std::optional<uint16_t> ingredientId_;
  std::unique_ptr<OutputChannel> output_;

  std::int64_t stopAtUs_;
  bool running_;

  std::optional<Calibration> calibration_;
};