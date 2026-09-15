#pragma once

#include <cstdint>
#include <vector>

#include "ingredient/IngredientConfig.hpp"
#include "pump/PumpConfig.hpp"
#include "recipe/RecipeConfig.hpp"
#include "settings/DeviceSettings.hpp"

enum class DrinkStrength { LESS, STANDARD, MORE };

struct RecipeAvailability {
  bool available;
  std::vector<std::uint16_t> missingIngredientIds;
  std::vector<std::uint16_t> uncalibratedIngredientIds;
};

enum class RecipeCalculationResult {
  SUCCESS,
  INVALID_SIZE,
  STRENGTH_NOT_SUPPORTED,
  INVALID_RECIPE
};

class RecipePlanner {
public:
  static RecipeAvailability
  availability(const std::vector<RecipeItem> &items,
               const std::vector<PumpConfig> &pumps);

  static bool strengthAdjustmentAvailable(
      const RecipeConfig &recipe,
      const std::vector<IngredientConfig> &ingredients);

  static RecipeCalculationResult calculate(
      const RecipeConfig &recipe,
      const std::vector<IngredientConfig> &ingredients,
      const DeviceSettings &settings, std::uint16_t sizeMl,
      DrinkStrength strength, const std::vector<RecipeItem> &overrides,
      std::vector<RecipeItem> &effectiveItems);
};
