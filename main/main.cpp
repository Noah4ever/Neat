#include "api/API.hpp"
#include "freertos/FreeRTOS.h" // IWYU pragma: keep
#include "freertos/task.h"
#include "machine/MachineLogic.hpp"
#include "pump/PumpControl.hpp"
#include "storage/PumpConfigRepository.hpp"
#include "storage/RecipeConfigRepository.hpp"

extern "C" void app_main(void) {
  PumpControl pumpControl;

  PumpConfigRepository pumpRepository;
  pumpControl.init(pumpRepository.loadAll());

  // Test
  pumpControl.startPump(1, 10);

  RecipeConfigRepository recipeRepository;
  MachineLogic machineLogic =
      MachineLogic(pumpControl, recipeRepository, pumpRepository);
  API api;

  machineLogic.init();
  api.start();

  while (true) {
    machineLogic.update();
    vTaskDelay(10);
  }
}
