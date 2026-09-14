#include "io/LED.hpp"

#include <utility>

LED::LED(std::unique_ptr<OutputChannel> output) : output_(std::move(output)) {
  off();
}
void LED::on() { output_->set(true); }

void LED::off() { output_->set(false); }

void LED::setState(bool state) { output_->set(state); }