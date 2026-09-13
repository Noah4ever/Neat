#include "pump/Calibration.hpp"

Calibration::Calibration(float flowRateMlPerSecond)
    : flowRateMlPerSecond_(flowRateMlPerSecond)
{
}

float Calibration::getFlowRate() const
{
    return flowRateMlPerSecond_;
}