#pragma once

#include "io/Button.hpp"

class SensorHandling {
public:
  SensorHandling();

  bool isGlassPresent();

private:
  Button glassButton_;
};