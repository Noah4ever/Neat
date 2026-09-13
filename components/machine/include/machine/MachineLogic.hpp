#pragma once

#include <cstdint>
#include <vector>

#include "pump/PumpControl.hpp"
#include "recipe/RecipeConfig.hpp"
#include "recipe/RecipeResults.hpp"
#include "storage/PumpConfigRepository.hpp"
#include "storage/RecipeConfigRepository.hpp"

class MachineLogic {
public:
  MachineLogic(PumpControl &pumpControl,
               RecipeConfigRepository &recipeRepository,
               PumpConfigRepository &pumpRepository);
  void update();
  void init();

  StartRecipeResult startRecipe(std::uint16_t recipeId,
                                const std::vector<RecipeItem> &overrides);

  void startCleaningPump(std::uint8_t pumpId, std::uint64_t durationMs);
  void startCleaningAllPumps();

  PumpResult startCalibrationPump(std::uint8_t pumpId,
                                  std::uint64_t durationMs);
  PumpResult finishedCalibrationPump(std::uint64_t measuredMl);

  void stopCurrentOperation();

private:
  PumpControl &pumpControl_;
  RecipeConfigRepository &recipeRepository_;
  PumpConfigRepository &pumpRepository_;

  std::uint8_t currentCalibrationPumpId_;
  std::uint64_t currentCalibrationDurationMs_;

  static constexpr std::uint64_t MAX_CLEANING_DURATION_MS = 60000;
};
