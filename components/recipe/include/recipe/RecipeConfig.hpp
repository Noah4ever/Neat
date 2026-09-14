#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

struct RecipeItem {
  std::uint16_t ingredientId;
  std::uint16_t amountMl;
};

struct RecipeConfig {
  std::uint16_t id;
  std::string name;
  std::optional<std::string> imageKey;
  std::vector<RecipeItem> items;
};
