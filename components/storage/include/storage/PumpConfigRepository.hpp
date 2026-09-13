#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "pump/PumpConfig.hpp"

class PumpConfigRepository {
public:
    PumpConfigRepository();

    std::vector<PumpConfig> loadAll();
    std::optional<PumpConfig> findById(std::uint8_t id);
    bool add(const PumpConfig& config);
    bool update(const PumpConfig& config);
    bool remove(std::uint8_t id);

private:
    bool readAll(std::vector<PumpConfig>& configs) const;
    bool saveAll(const std::vector<PumpConfig>& configs) const;
    bool serialize(const std::vector<PumpConfig>& configs, std::string& json) const;
    bool deserialize(const std::string& json, std::vector<PumpConfig>& configs) const;

    bool mounted_;
};
