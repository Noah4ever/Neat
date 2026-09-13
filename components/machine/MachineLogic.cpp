#include "machine/MachineLogic.hpp"
#include "pump/PumpControl.hpp"
#include "recipe/RecipeConfig.hpp"
#include "recipe/RecipeResults.hpp"
#include "storage/PumpConfigRepository.hpp"
#include <algorithm>
#include <cstdint>

MachineLogic::MachineLogic(PumpControl &pumpControl,
                           RecipeConfigRepository &recipeRepository,
                           PumpConfigRepository &pumpRepository)
    : pumpControl_(pumpControl), recipeRepository_(recipeRepository),
      pumpRepository_(pumpRepository), currentCalibrationDurationMs_(0) {}

void MachineLogic::init() {}

void MachineLogic::update() { pumpControl_.update(); }

StartRecipeResult
MachineLogic::startRecipe(std::uint16_t recipeId,
                          const std::vector<RecipeItem> &overrides) {
  std::optional<RecipeConfig> recipe = recipeRepository_.findById(recipeId);
  if (!recipe.has_value()) {
    return StartRecipeResult::RECIPE_NOT_FOUND;
  }

  RecipeConfig effectiveRecipe = *recipe;
  for (const RecipeItem &overrideItem : overrides) {
    const auto existingItem = std::find_if(
        effectiveRecipe.items.begin(), effectiveRecipe.items.end(),
        [&overrideItem](const RecipeItem &item) {
          return item.ingredientId == overrideItem.ingredientId;
        });

    if (existingItem != effectiveRecipe.items.end()) {
      existingItem->amountMl = overrideItem.amountMl;
    } else if (overrideItem.amountMl > 0) {
      effectiveRecipe.items.push_back(overrideItem);
    }
  }

  struct DispenseItem {
    std::uint8_t pumpId;
    std::uint16_t amountMl;
  };

  std::vector<DispenseItem> dispensingPlan;
  dispensingPlan.reserve(effectiveRecipe.items.size());

  for (const RecipeItem &item : effectiveRecipe.items) {
    if (item.amountMl == 0) {
      continue;
    }

    const std::optional<std::uint8_t> pumpId =
        pumpControl_.findPumpIdByIngredientId(item.ingredientId);
    if (!pumpId.has_value()) {
      return StartRecipeResult::INGREDIENT_NOT_AVAILABLE;
    }

    dispensingPlan.push_back({.pumpId = *pumpId, .amountMl = item.amountMl});
  }

  for (const DispenseItem &item : dispensingPlan) {
    const PumpResult result = pumpControl_.validatePump(item.pumpId);
    if (result == PumpResult::NOT_CALIBRATED) {
      return StartRecipeResult::PUMP_NOT_CALIBRATED;
    }
    if (result != PumpResult::SUCCESS) {
      return StartRecipeResult::START_FAILED;
    }
  }

  bool pumpStarted = false;
  for (const DispenseItem &item : dispensingPlan) {
    const PumpResult result = pumpControl_.startPump(item.pumpId, item.amountMl);
    if (result == PumpResult::SUCCESS) {
      pumpStarted = true;
      continue;
    }

    if (pumpStarted) {
      pumpControl_.stopAllPumps();
    }

    if (result == PumpResult::NOT_CALIBRATED) {
      return StartRecipeResult::PUMP_NOT_CALIBRATED;
    }
    return StartRecipeResult::START_FAILED;
  }

  return StartRecipeResult::SUCCESS;
}

void MachineLogic::startCleaningPump(std::uint8_t pumpId,
                                     std::uint64_t durationMs) {
  pumpControl_.startPumpForDuration(pumpId, MAX_CLEANING_DURATION_MS);
}
void MachineLogic::startCleaningAllPumps() {
  pumpControl_.startAllPumpsForDuration(MAX_CLEANING_DURATION_MS);
}

PumpResult MachineLogic::startCalibrationPump(std::uint8_t pumpId,
                                              std::uint64_t durationMs) {
  currentCalibrationDurationMs_ = durationMs;
  return pumpControl_.startPumpForDuration(pumpId, durationMs);
}

PumpResult MachineLogic::finishedCalibrationPump(std::uint64_t measuredMl) {
  const float mlPerSec = (static_cast<float>(measuredMl) * 1000.0f) /
                         static_cast<float>(currentCalibrationDurationMs_);

  return pumpControl_.setPumpCalibration(currentCalibrationPumpId_, mlPerSec);
}

void MachineLogic::stopCurrentOperation() { pumpControl_.stopAllPumps(); }
