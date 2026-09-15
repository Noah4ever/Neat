#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "recipe/RecipeConfig.hpp"

class RecipeConfigRepository {
public:
    RecipeConfigRepository();

    std::vector<RecipeConfig> loadAll();
    std::optional<RecipeConfig> findById(std::uint16_t id);
    std::optional<RecipeConfig> create(
        const std::string& name,
        const std::vector<RecipeItem>& items,
        std::optional<std::string> imageKey = std::nullopt,
        std::optional<std::string> subtitle = std::nullopt,
        std::optional<std::string> description = std::nullopt,
        std::uint16_t baseSizeMl = 400,
        std::vector<PreparationStep> preparationSteps = {});
    bool update(const RecipeConfig& config);
    bool remove(std::uint16_t id);

private:
    bool readAll(std::vector<RecipeConfig>& configs) const;
    bool saveAll(const std::vector<RecipeConfig>& configs) const;
    bool serialize(const std::vector<RecipeConfig>& configs, std::string& json) const;
    bool deserialize(const std::string& json, std::vector<RecipeConfig>& configs) const;
    bool generateId(const std::vector<RecipeConfig>& configs, std::uint16_t& id) const;

    bool mounted_;
};
