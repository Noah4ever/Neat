#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

struct RecipeItem {
  std::uint16_t ingredientId;
  std::uint16_t amountMl;
  bool machineDispensed = true;
};

enum class PreparationPhase { BEFORE, AFTER };

struct PreparationStep {
  PreparationPhase phase;
  std::string text;
};

struct RecipeConfig {
  std::uint16_t id;
  std::string name;
  std::optional<std::string> imageKey;
  std::optional<std::string> subtitle;
  std::optional<std::string> description;
  std::uint16_t baseSizeMl;
  std::vector<PreparationStep> preparationSteps;
  std::vector<RecipeItem> items;
};
