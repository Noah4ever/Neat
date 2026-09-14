#pragma once

#include "settings/DeviceSettings.hpp"

class DeviceSettingsRepository {
public:
  DeviceSettings load() const;
  bool save(const DeviceSettings &settings) const;
};
