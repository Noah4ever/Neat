#include "feedback/FeedbackControl.hpp"

#include <array>
#include <utility>

FeedbackControl::FeedbackControl(
    std::vector<PumpLedMapping> pumpLedMappings,
    gpio_num_t buzzerPin)
    : pumpLedMappings_(std::move(pumpLedMappings)), buzzer_(buzzerPin) {}

void FeedbackControl::update() {
  buzzer_.update();

  if (currentMelody_ == nullptr) {
    return;
  }

  if (buzzer_.isPlaying()) {
    return;
  }

  ++currentToneIndex_;

  if (currentToneIndex_ >= currentMelodySize_) {
    currentMelody_ = nullptr;
    currentMelodySize_ = 0;
    currentToneIndex_ = 0;
    return;
  }

  startCurrentTone();
}

void FeedbackControl::setPumpLed(std::uint8_t pumpId, bool state) {
  if (testLedOverrideActive_) return;
  for (PumpLedMapping &mapping : pumpLedMappings_) {
    if (mapping.pumpId == pumpId) {
      mapping.led.setState(state);
      return;
    }
  }
}

void FeedbackControl::turnOffAllPumpLeds() {
  if (testLedOverrideActive_) return;
  for (PumpLedMapping &mapping : pumpLedMappings_) {
    mapping.led.off();
  }
}

bool FeedbackControl::setTestPumpLed(std::uint8_t pumpId, bool state) {
  if (!testLedOverrideActive_) {
    for (PumpLedMapping &mapping : pumpLedMappings_) mapping.led.off();
    testLedOverrideActive_ = true;
  }
  for (PumpLedMapping &mapping : pumpLedMappings_) {
    if (mapping.pumpId == pumpId) {
      mapping.led.setState(state);
      return true;
    }
  }
  return false;
}

void FeedbackControl::resetTestPumpLeds() {
  testLedOverrideActive_ = false;
  for (PumpLedMapping &mapping : pumpLedMappings_) mapping.led.off();
}

void FeedbackControl::playSuccess() {
  startMelody(successMelody_.data(), successMelody_.size());
}

void FeedbackControl::playError() {
  startMelody(errorMelody_.data(), errorMelody_.size());
}

void FeedbackControl::setSounds(const std::vector<BuzzerTone> &success,
                                const std::vector<BuzzerTone> &error) {
  stopSound();
  successMelody_ = success;
  errorMelody_ = error;
}

void FeedbackControl::stopSound() {
  buzzer_.stop();

  currentMelody_ = nullptr;
  currentMelodySize_ = 0;
  currentToneIndex_ = 0;
}

void FeedbackControl::startMelody(const BuzzerTone *melody, std::size_t size) {

  buzzer_.stop();

  currentMelody_ = melody;
  currentMelodySize_ = size;
  currentToneIndex_ = 0;

  if (currentMelody_ == nullptr || currentMelodySize_ == 0) {
    return;
  }

  startCurrentTone();
}

void FeedbackControl::startCurrentTone() {
  const BuzzerTone &tone = currentMelody_[currentToneIndex_];

  buzzer_.playTone(tone.frequencyHz, tone.durationMs);
}
