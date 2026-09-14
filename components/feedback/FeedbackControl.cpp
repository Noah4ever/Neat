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
  for (PumpLedMapping &mapping : pumpLedMappings_) {
    if (mapping.pumpId == pumpId) {
      mapping.led.setState(state);
      return;
    }
  }
}

void FeedbackControl::turnOffAllPumpLeds() {
  for (PumpLedMapping &mapping : pumpLedMappings_) {
    mapping.led.off();
  }
}

void FeedbackControl::playSuccess() {
  startMelody(SUCCESS_MELODY.data(), SUCCESS_MELODY.size());
}

void FeedbackControl::playError() {
  startMelody(ERROR_MELODY.data(), ERROR_MELODY.size());
}

void FeedbackControl::stopSound() {
  buzzer_.stop();

  currentMelody_ = nullptr;
  currentMelodySize_ = 0;
  currentToneIndex_ = 0;
}

void FeedbackControl::startMelody(const Tone *melody, std::size_t size) {

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
  const Tone &tone = currentMelody_[currentToneIndex_];

  buzzer_.playTone(tone.frequencyHz, tone.durationMs);
}
