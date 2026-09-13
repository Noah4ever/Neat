#pragma once

#include <cstdint>

enum class OutputChannelType : std::uint8_t
{
  GPIO
};

struct OutputChannelConfig
{
  OutputChannelType type;
  std::uint8_t channel;
};
