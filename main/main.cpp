#include "api/API.hpp"
#include "machine/MachineLogic.hpp"
#include "pump/PumpControl.hpp"
#include "storage/IngredientConfigRepository.hpp"
#include "storage/PumpConfigRepository.hpp"
#include "storage/RecipeConfigRepository.hpp"
#include "wifi/WiFiController.hpp"

#include "esp_err.h"
#include "freertos/FreeRTOS.h" // IWYU pragma: keep
#include "freertos/task.h"

extern "C" void app_main(void) {
  // Storage
  PumpConfigRepository pumpRepository;
  RecipeConfigRepository recipeRepository;
  IngredientConfigRepository ingredientRepository;

  // Machine
  PumpControl pumpControl;
  pumpControl.init(pumpRepository.loadAll());

  MachineLogic machineLogic(pumpControl, recipeRepository, pumpRepository);

  machineLogic.init();

  // Network
  WiFiController wifiController("NEAT", "neat1234");

  ESP_ERROR_CHECK(wifiController.init());

  // API
  API api(machineLogic, pumpControl, wifiController, recipeRepository,
          ingredientRepository, pumpRepository);

  ESP_ERROR_CHECK(api.start());

  // Main loop
  while (true) {
    machineLogic.update();
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
