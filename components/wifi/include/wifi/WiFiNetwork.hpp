#pragma once

#include <cstdint>
#include <string>

struct WiFiNetwork {
  std::string ssid;
  std::int8_t rssi;
  bool secure;
};