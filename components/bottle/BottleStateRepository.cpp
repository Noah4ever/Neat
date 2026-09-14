#include "bottle/BottleStateRepository.hpp"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>

#include "nvs.h"

namespace {

constexpr char kNamespace[] = "bottle_state";
constexpr char kStatesKey[] = "states";
constexpr std::uint8_t kFormatVersion = 1;
constexpr std::size_t kHeaderSize = 2;
constexpr std::size_t kRecordSize = 7;

void appendUint16(std::vector<std::uint8_t> &data, std::uint16_t value) {
  data.push_back(static_cast<std::uint8_t>(value & 0xff));
  data.push_back(static_cast<std::uint8_t>(value >> 8));
}

std::uint16_t readUint16(const std::uint8_t *data) {
  return static_cast<std::uint16_t>(data[0]) |
         static_cast<std::uint16_t>(data[1] << 8);
}

} // namespace

std::vector<BottleState> BottleStateRepository::loadAll() const {
  std::vector<BottleState> states;
  if (!readAll(states)) {
    states.clear();
  }
  return states;
}

std::optional<BottleState>
BottleStateRepository::findByPumpId(std::uint8_t pumpId) const {
  std::vector<BottleState> states;
  if (!readAll(states)) {
    return std::nullopt;
  }
  const auto state = std::find_if(
      states.begin(), states.end(),
      [pumpId](const BottleState &candidate) {
        return candidate.pumpId == pumpId;
      });
  return state == states.end() ? std::nullopt
                               : std::optional<BottleState>{*state};
}

bool BottleStateRepository::update(const BottleState &state) const {
  if (!std::isfinite(state.remainingMl)) {
    return false;
  }

  std::vector<BottleState> states;
  if (!readAll(states)) {
    return false;
  }

  BottleState normalized = state;
  normalized.remainingMl = std::max(0.0f, normalized.remainingMl);
  const auto existing = std::find_if(
      states.begin(), states.end(),
      [&normalized](const BottleState &candidate) {
        return candidate.pumpId == normalized.pumpId;
      });
  if (existing == states.end()) {
    states.push_back(normalized);
  } else {
    *existing = normalized;
  }
  return saveAll(states);
}

bool BottleStateRepository::readAll(std::vector<BottleState> &states) const {
  states.clear();
  nvs_handle_t handle = 0;
  const esp_err_t openResult = nvs_open(kNamespace, NVS_READONLY, &handle);
  if (openResult == ESP_ERR_NVS_NOT_FOUND) {
    return true;
  }
  if (openResult != ESP_OK) {
    return false;
  }

  std::size_t size = 0;
  esp_err_t result = nvs_get_blob(handle, kStatesKey, nullptr, &size);
  if (result == ESP_ERR_NVS_NOT_FOUND) {
    nvs_close(handle);
    return true;
  }
  if (result != ESP_OK || size < kHeaderSize) {
    nvs_close(handle);
    return false;
  }

  std::vector<std::uint8_t> data(size);
  result = nvs_get_blob(handle, kStatesKey, data.data(), &size);
  nvs_close(handle);
  if (result != ESP_OK || data[0] != kFormatVersion ||
      size != kHeaderSize + static_cast<std::size_t>(data[1]) * kRecordSize) {
    return false;
  }

  states.reserve(data[1]);
  for (std::size_t index = 0; index < data[1]; ++index) {
    const std::uint8_t *record =
        data.data() + kHeaderSize + index * kRecordSize;
    float remainingMl = 0;
    std::memcpy(&remainingMl, record + 3, sizeof(remainingMl));
    if (!std::isfinite(remainingMl)) {
      return false;
    }
    const std::uint8_t pumpId = record[0];
    if (std::any_of(states.begin(), states.end(),
                    [pumpId](const BottleState &candidate) {
                      return candidate.pumpId == pumpId;
                    })) {
      return false;
    }
    states.push_back({.pumpId = pumpId,
                      .capacityMl = readUint16(record + 1),
                      .remainingMl = std::max(0.0f, remainingMl)});
  }
  return true;
}

bool BottleStateRepository::saveAll(
    const std::vector<BottleState> &states) const {
  if (states.size() > std::numeric_limits<std::uint8_t>::max()) {
    return false;
  }

  std::vector<std::uint8_t> data;
  data.reserve(kHeaderSize + states.size() * kRecordSize);
  data.push_back(kFormatVersion);
  data.push_back(static_cast<std::uint8_t>(states.size()));
  for (const BottleState &state : states) {
    if (!std::isfinite(state.remainingMl)) {
      return false;
    }
    data.push_back(state.pumpId);
    appendUint16(data, state.capacityMl);
    const float remainingMl = std::max(0.0f, state.remainingMl);
    const auto *bytes = reinterpret_cast<const std::uint8_t *>(&remainingMl);
    data.insert(data.end(), bytes, bytes + sizeof(remainingMl));
  }

  nvs_handle_t handle = 0;
  if (nvs_open(kNamespace, NVS_READWRITE, &handle) != ESP_OK) {
    return false;
  }
  const esp_err_t writeResult =
      nvs_set_blob(handle, kStatesKey, data.data(), data.size());
  const esp_err_t commitResult =
      writeResult == ESP_OK ? nvs_commit(handle) : writeResult;
  nvs_close(handle);
  return writeResult == ESP_OK && commitResult == ESP_OK;
}
