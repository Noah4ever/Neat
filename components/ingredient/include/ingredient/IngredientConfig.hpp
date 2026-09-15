#pragma once

#include <cstdint>
#include <string>

enum class IngredientCategory { ALCOHOL, JUICE, MIXER, SYRUP, OTHER };

struct IngredientConfig {
  std::uint16_t id;
  std::string name;
  IngredientCategory category = IngredientCategory::OTHER;
};
