#include "api/API.hpp"
#include "esp_err.h"

API::API(MachineLogic &machineLogic, RecipeConfigRepository &recipeRepository,
         IngredientConfigRepository &ingredientRepository,
         PumpConfigRepository &pumpRepository)
    : machineLogic_(machineLogic), recipeRepository_(recipeRepository),
      ingredientRepository_(ingredientRepository),
      pumpRepository_(pumpRepository) {}

esp_err_t API::start() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();

  esp_err_t result = httpd_start(&server_, &config);

  if (result != ESP_OK) {
    return result;
  }

  result = registerRoutes();

  if (result != ESP_OK) {
    httpd_stop(server_);
    server_ = nullptr;
    return result;
  }

  return ESP_OK;
}

void stop() {}

esp_err_t API::registerRoutes() {
  httpd_uri_t healthRoute = {.uri = "/api/health",
                             .method = HTTP_GET,
                             .handler = &API::healthHandler,
                             .user_ctx = this};

  return httpd_register_uri_handler(server_, &healthRoute);
}