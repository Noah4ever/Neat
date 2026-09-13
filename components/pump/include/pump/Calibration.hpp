#pragma once

class Calibration {
public:
    explicit Calibration(float flowRateMlPerSecond);

    float getFlowRate() const;

private:
    float flowRateMlPerSecond_;
};