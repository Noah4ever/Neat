#include "machine/RecipePlanner.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <numeric>

namespace {
IngredientCategory categoryFor(
    std::uint16_t id, const std::vector<IngredientConfig> &ingredients) {
  const auto ingredient = std::find_if(
      ingredients.begin(), ingredients.end(),
      [id](const IngredientConfig &candidate) { return candidate.id == id; });
  return ingredient == ingredients.end() ? IngredientCategory::OTHER
                                         : ingredient->category;
}

void addUnique(std::vector<std::uint16_t> &values, std::uint16_t value) {
  if (std::find(values.begin(), values.end(), value) == values.end()) {
    values.push_back(value);
  }
}
} // namespace

RecipeAvailability
RecipePlanner::availability(const std::vector<RecipeItem> &items,
                            const std::vector<PumpConfig> &pumps) {
  RecipeAvailability result{.available = true,
                            .missingIngredientIds = {},
                            .uncalibratedIngredientIds = {}};
  for (const RecipeItem &item : items) {
    if (item.amountMl == 0 || !item.machineDispensed) {
      continue;
    }
    bool assigned = false;
    bool calibrated = false;
    for (const PumpConfig &pump : pumps) {
      if (pump.ingredientId && *pump.ingredientId == item.ingredientId) {
        assigned = true;
        if (pump.mlPerSec && std::isfinite(*pump.mlPerSec) &&
            *pump.mlPerSec > 0.0f) {
          calibrated = true;
        }
      }
    }
    if (!assigned) {
      addUnique(result.missingIngredientIds, item.ingredientId);
    } else if (!calibrated) {
      addUnique(result.uncalibratedIngredientIds, item.ingredientId);
    }
  }
  result.available = result.missingIngredientIds.empty() &&
                     result.uncalibratedIngredientIds.empty();
  return result;
}

bool RecipePlanner::strengthAdjustmentAvailable(
    const RecipeConfig &recipe,
    const std::vector<IngredientConfig> &ingredients) {
  bool hasAlcohol = false;
  for (const RecipeItem &item : recipe.items) {
    if (item.amountMl == 0) {
      continue;
    }
    if (categoryFor(item.ingredientId, ingredients) ==
        IngredientCategory::ALCOHOL) {
      hasAlcohol = true;
    }
  }
  return hasAlcohol;
}

RecipeCalculationResult RecipePlanner::calculate(
    const RecipeConfig &recipe,
    const std::vector<IngredientConfig> &ingredients,
    const DeviceSettings &settings, std::uint16_t sizeMl,
    DrinkStrength strength, const std::vector<RecipeItem> &overrides,
    std::vector<RecipeItem> &effectiveItems) {
  effectiveItems.clear();
  if (recipe.baseSizeMl == 0 ||
      std::find(settings.drinkSizesMl.begin(), settings.drinkSizesMl.end(),
                sizeMl) == settings.drinkSizesMl.end()) {
    return RecipeCalculationResult::INVALID_SIZE;
  }

  struct Amount {
    std::uint16_t ingredientId;
    double ml;
    bool alcohol;
    bool machineDispensed;
  };
  std::vector<Amount> amounts;
  const double sizeFactor = static_cast<double>(sizeMl) / recipe.baseSizeMl;
  for (const RecipeItem &item : recipe.items) {
    const auto existing = std::find_if(
        amounts.begin(), amounts.end(), [&item](const Amount &candidate) {
          return candidate.ingredientId == item.ingredientId;
        });
    const double scaled = static_cast<double>(item.amountMl) * sizeFactor;
    if (existing == amounts.end()) {
      amounts.push_back(
          {.ingredientId = item.ingredientId,
           .ml = scaled,
           .alcohol = categoryFor(item.ingredientId, ingredients) ==
                      IngredientCategory::ALCOHOL,
           .machineDispensed = item.machineDispensed});
    } else {
      existing->ml += scaled;
    }
  }

  if (strength != DrinkStrength::STANDARD) {
    if (!strengthAdjustmentAvailable(recipe, ingredients)) {
      return RecipeCalculationResult::STRENGTH_NOT_SUPPORTED;
    }
    const double factor = strength == DrinkStrength::LESS
                              ? settings.alcoholStrengthLessFactor
                              : settings.alcoholStrengthMoreFactor;
    double alcoholTotal = 0.0;
    double nonAlcoholTotal = 0.0;
    for (const Amount &amount : amounts) {
      (amount.alcohol ? alcoholTotal : nonAlcoholTotal) += amount.ml;
    }
    const double adjustedAlcoholTotal = alcoholTotal * factor;
    const double adjustedNonAlcoholTotal =
        nonAlcoholTotal - (adjustedAlcoholTotal - alcoholTotal);
    if (nonAlcoholTotal > 0.0 && adjustedNonAlcoholTotal < 0.0) {
      return RecipeCalculationResult::STRENGTH_NOT_SUPPORTED;
    }
    const double nonAlcoholFactor = nonAlcoholTotal > 0.0
                                        ? adjustedNonAlcoholTotal /
                                              nonAlcoholTotal
                                        : 1.0;
    for (Amount &amount : amounts) {
      amount.ml *= amount.alcohol ? factor : nonAlcoholFactor;
    }
  }

  const long targetTotal = std::lround(std::accumulate(
      amounts.begin(), amounts.end(), 0.0,
      [](double total, const Amount &amount) { return total + amount.ml; }));
  long roundedTotal = 0;
  for (const Amount &amount : amounts) {
    const long rounded = std::lround(amount.ml);
    if (rounded < 0 || rounded > std::numeric_limits<std::uint16_t>::max()) {
      return RecipeCalculationResult::INVALID_RECIPE;
    }
    effectiveItems.push_back({.ingredientId = amount.ingredientId,
                              .amountMl = static_cast<std::uint16_t>(rounded),
                              .machineDispensed = amount.machineDispensed});
    roundedTotal += rounded;
  }
  const long correction = targetTotal - roundedTotal;
  if (correction != 0 && !effectiveItems.empty()) {
    auto correctionItem = effectiveItems.end();
    for (auto item = effectiveItems.begin(); item != effectiveItems.end();
         ++item) {
      if (categoryFor(item->ingredientId, ingredients) !=
          IngredientCategory::ALCOHOL) {
        correctionItem = item;
        break;
      }
    }
    if (correctionItem == effectiveItems.end()) {
      correctionItem = effectiveItems.begin();
    }
    const long corrected = static_cast<long>(correctionItem->amountMl) + correction;
    if (corrected < 0 || corrected > std::numeric_limits<std::uint16_t>::max()) {
      return RecipeCalculationResult::INVALID_RECIPE;
    }
    correctionItem->amountMl = static_cast<std::uint16_t>(corrected);
  }

  for (const RecipeItem &overrideItem : overrides) {
    const auto existing = std::find_if(
        effectiveItems.begin(), effectiveItems.end(),
        [&overrideItem](const RecipeItem &item) {
          return item.ingredientId == overrideItem.ingredientId;
        });
    if (existing != effectiveItems.end()) {
      existing->amountMl = overrideItem.amountMl;
    } else if (overrideItem.amountMl > 0) {
      effectiveItems.push_back(overrideItem);
    }
  }
  return RecipeCalculationResult::SUCCESS;
}
