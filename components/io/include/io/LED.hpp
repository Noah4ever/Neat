#pragma once

#include <memory>

#include "io/OutputChannel.hpp"

class LED {
public:
  explicit LED(std::unique_ptr<OutputChannel> output);

  void on();
  void off();

  void setState(bool state);

private:
  std::unique_ptr<OutputChannel> output_;
};