#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "ingredient/IngredientConfig.hpp"

class IngredientConfigRepository {
public:
    IngredientConfigRepository();

    std::vector<IngredientConfig> loadAll();
    std::optional<IngredientConfig> findById(std::uint16_t id);
    std::optional<IngredientConfig> create(const std::string& name);
    bool update(const IngredientConfig& config);
    bool remove(std::uint16_t id);

private:
    bool readAll(std::vector<IngredientConfig>& configs) const;
    bool saveAll(const std::vector<IngredientConfig>& configs) const;
    bool serialize(const std::vector<IngredientConfig>& configs, std::string& json) const;
    bool deserialize(const std::string& json, std::vector<IngredientConfig>& configs) const;
    bool generateId(const std::vector<IngredientConfig>& configs, std::uint16_t& id) const;

    bool mounted_;
};
