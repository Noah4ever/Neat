#pragma once

#include "esp_err.h"
#include "esp_http_server.h"
#include "machine/MachineLogic.hpp"
#include "storage/IngredientConfigRepository.hpp"
#include "storage/PumpConfigRepository.hpp"
#include "storage/RecipeConfigRepository.hpp"
class API {
public:
  API(MachineLogic &machineLogic, RecipeConfigRepository &recipeRepository,
      IngredientConfigRepository &ingredientRepository,
      PumpConfigRepository &pumpRepository);
  esp_err_t start();
  void stop();

private:
  MachineLogic &machineLogic_;
  RecipeConfigRepository &recipeRepository_;
  IngredientConfigRepository &ingredientRepository_;
  PumpConfigRepository &pumpRepository_;

  httpd_handle_t server_ = nullptr;

  esp_err_t registerRoutes();

  static esp_err_t healthHandler(httpd_req_t *req);
  esp_err_t handleHealth(httpd_req_t *req);
};