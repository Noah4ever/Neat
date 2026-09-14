#include "api/API.hpp"
#include "bottle/BottleStateRepository.hpp"
#include "feedback/FeedbackControl.hpp"
#include "io/GPIOOutput.hpp"
#include "io/LED.hpp"
#include "io/Pins.hpp"
#include "machine/MachineLogic.hpp"
#include "pump/PumpControl.hpp"
#include "sensor/SensorHandling.hpp"
#include "settings/DeviceSettingsRepository.hpp"
#include "storage/IngredientConfigRepository.hpp"
#include "storage/PumpConfigRepository.hpp"
#include "storage/RecipeConfigRepository.hpp"
#include "wifi/WiFiController.hpp"

#include <memory>
#include <utility>
#include <vector>

#include "esp_err.h"
#include "freertos/FreeRTOS.h" // IWYU pragma: keep
#include "freertos/task.h"
#include "nvs_flash.h"

namespace {

void initializeNvs() {
  esp_err_t result = nvs_flash_init();
  if (result == ESP_ERR_NVS_NO_FREE_PAGES ||
      result == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    result = nvs_flash_init();
  }
  ESP_ERROR_CHECK(result);
}

} // namespace

extern "C" void app_main(void) {
  initializeNvs();

  // Storage
  PumpConfigRepository pumpRepository;
  RecipeConfigRepository recipeRepository;
  IngredientConfigRepository ingredientRepository;
  DeviceSettingsRepository deviceSettingsRepository;
  BottleStateRepository bottleStateRepository;

  // Machine
  PumpControl pumpControl;
  pumpControl.init(pumpRepository.loadAll());

  SensorHandling sensorHandling;

  std::vector<PumpLedMapping> pumpLedMappings;
  pumpLedMappings.emplace_back(PumpLedMapping{
      .pumpId = 1,
      .led = LED(std::make_unique<GPIOOutput>(Pins::BOTTLE_LED_1))});
  pumpLedMappings.emplace_back(PumpLedMapping{
      .pumpId = 2,
      .led = LED(std::make_unique<GPIOOutput>(Pins::BOTTLE_LED_2))});
  pumpLedMappings.emplace_back(PumpLedMapping{
      .pumpId = 3,
      .led = LED(std::make_unique<GPIOOutput>(Pins::BOTTLE_LED_3))});
  pumpLedMappings.emplace_back(PumpLedMapping{
      .pumpId = 4,
      .led = LED(std::make_unique<GPIOOutput>(Pins::BOTTLE_LED_4))});
  pumpLedMappings.emplace_back(PumpLedMapping{
      .pumpId = 5,
      .led = LED(std::make_unique<GPIOOutput>(Pins::BOTTLE_LED_5))});
  pumpLedMappings.emplace_back(PumpLedMapping{
      .pumpId = 6,
      .led = LED(std::make_unique<GPIOOutput>(Pins::BOTTLE_LED_6))});
  FeedbackControl feedbackControl(std::move(pumpLedMappings), Pins::BUZZER);

  MachineLogic machineLogic(pumpControl, recipeRepository, pumpRepository,
                            sensorHandling, feedbackControl,
                            deviceSettingsRepository, bottleStateRepository);

  machineLogic.init();

  // Network
  WiFiController wifiController("NEAT", "neat1234");

  ESP_ERROR_CHECK(wifiController.init());

  // API
  API api(machineLogic, pumpControl, wifiController, recipeRepository,
          ingredientRepository, pumpRepository, bottleStateRepository);

  ESP_ERROR_CHECK(api.start());

  // Main loop
  while (true) {
    machineLogic.update();
    feedbackControl.update();
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
