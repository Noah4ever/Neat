#include "sensor/SensorHandling.hpp"
#include "io/Button.hpp"
#include "io/Pins.hpp"

SensorHandling::SensorHandling() : glassButton_(Pins::GLASS_SENSOR) {}

bool SensorHandling::isGlassPresent() { return glassButton_.getState(); }