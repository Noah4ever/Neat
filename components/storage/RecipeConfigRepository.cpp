#include "storage/RecipeConfigRepository.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <memory>
#include <utility>

#include "FileStorageUtils.hpp"
#include "cJSON.h"

namespace {

constexpr char kConfigPath[] = "/storage/recipes.json";

using JsonPtr = std::unique_ptr<cJSON, decltype(&cJSON_Delete)>;
using JsonStringPtr = std::unique_ptr<char, decltype(&cJSON_free)>;

bool isUint16(const cJSON* value)
{
    return cJSON_IsNumber(value)
        && std::isfinite(value->valuedouble)
        && value->valuedouble >= 0.0
        && value->valuedouble <= std::numeric_limits<std::uint16_t>::max()
        && std::floor(value->valuedouble) == value->valuedouble;
}

} // namespace

RecipeConfigRepository::RecipeConfigRepository()
    : mounted_(storage_internal::mountFileSystem())
{
}

std::vector<RecipeConfig> RecipeConfigRepository::loadAll()
{
    std::vector<RecipeConfig> configs;
    if (!readAll(configs)) {
        configs.clear();
    }
    return configs;
}

std::optional<RecipeConfig> RecipeConfigRepository::findById(std::uint16_t id)
{
    std::vector<RecipeConfig> configs;
    if (!readAll(configs)) {
        return std::nullopt;
    }

    const auto config = std::find_if(
        configs.begin(),
        configs.end(),
        [id](const RecipeConfig& stored) { return stored.id == id; });
    return config == configs.end()
        ? std::nullopt
        : std::optional<RecipeConfig>{*config};
}

std::optional<RecipeConfig> RecipeConfigRepository::create(
    const std::string& name,
    const std::vector<RecipeItem>& items,
    std::optional<std::string> imageKey,
    std::optional<std::string> subtitle,
    std::optional<std::string> description,
    std::uint16_t baseSizeMl,
    std::vector<PreparationStep> preparationSteps)
{
    std::vector<RecipeConfig> configs;
    if (!readAll(configs)) {
        return std::nullopt;
    }

    std::uint16_t id = 0;
    if (!generateId(configs, id)) {
        return std::nullopt;
    }

    RecipeConfig config{
        .id = id,
        .name = name,
        .imageKey = std::move(imageKey),
        .subtitle = std::move(subtitle),
        .description = std::move(description),
        .baseSizeMl = baseSizeMl,
        .preparationSteps = std::move(preparationSteps),
        .items = items,
    };
    configs.push_back(config);
    if (!saveAll(configs)) {
        return std::nullopt;
    }

    return config;
}

bool RecipeConfigRepository::update(const RecipeConfig& config)
{
    std::vector<RecipeConfig> configs;
    if (!readAll(configs)) {
        return false;
    }

    const auto existing = std::find_if(
        configs.begin(),
        configs.end(),
        [&config](const RecipeConfig& stored) { return stored.id == config.id; });
    if (existing == configs.end()) {
        return false;
    }

    *existing = config;
    return saveAll(configs);
}

bool RecipeConfigRepository::remove(std::uint16_t id)
{
    std::vector<RecipeConfig> configs;
    if (!readAll(configs)) {
        return false;
    }

    const auto existing = std::find_if(
        configs.begin(),
        configs.end(),
        [id](const RecipeConfig& stored) { return stored.id == id; });
    if (existing == configs.end()) {
        return false;
    }

    configs.erase(existing);
    return saveAll(configs);
}

bool RecipeConfigRepository::readAll(std::vector<RecipeConfig>& configs) const
{
    configs.clear();
    if (!mounted_) {
        return false;
    }

    std::string json;
    bool exists = false;
    if (!storage_internal::readTextFile(kConfigPath, json, exists)) {
        return false;
    }
    return !exists || deserialize(json, configs);
}

bool RecipeConfigRepository::saveAll(const std::vector<RecipeConfig>& configs) const
{
    if (!mounted_) {
        return false;
    }

    std::string json;
    return serialize(configs, json)
        && storage_internal::writeTextFile(kConfigPath, json);
}

bool RecipeConfigRepository::serialize(
    const std::vector<RecipeConfig>& configs,
    std::string& json) const
{
    JsonPtr root(cJSON_CreateArray(), cJSON_Delete);
    if (!root) {
        return false;
    }

    for (const RecipeConfig& config : configs) {
        cJSON* item = cJSON_CreateObject();
        cJSON* items = cJSON_CreateArray();
        cJSON* preparationSteps = cJSON_CreateArray();
        if (item == nullptr || items == nullptr || preparationSteps == nullptr) {
            cJSON_Delete(item);
            cJSON_Delete(items);
            cJSON_Delete(preparationSteps);
            return false;
        }

        bool itemsValid = true;
        for (const RecipeItem& recipeItem : config.items) {
            cJSON* jsonItem = cJSON_CreateObject();
            if (jsonItem == nullptr
                || cJSON_AddNumberToObject(
                       jsonItem, "ingredientId", recipeItem.ingredientId) == nullptr
                || cJSON_AddNumberToObject(jsonItem, "amountMl", recipeItem.amountMl) == nullptr
                || !cJSON_AddItemToArray(items, jsonItem)) {
                cJSON_Delete(jsonItem);
                itemsValid = false;
                break;
            }
        }

        if (!itemsValid
            || cJSON_AddNumberToObject(item, "id", config.id) == nullptr
            || cJSON_AddStringToObject(item, "name", config.name.c_str()) == nullptr
            || cJSON_AddNumberToObject(item, "baseSizeMl", config.baseSizeMl) == nullptr) {
            cJSON_Delete(item);
            cJSON_Delete(items);
            cJSON_Delete(preparationSteps);
            return false;
        }

        if (config.imageKey.has_value()) {
            if (cJSON_AddStringToObject(
                    item, "imageKey", config.imageKey->c_str()) == nullptr) {
                cJSON_Delete(item);
                cJSON_Delete(items);
                cJSON_Delete(preparationSteps);
                return false;
            }
        } else if (cJSON_AddNullToObject(item, "imageKey") == nullptr) {
            cJSON_Delete(item);
            cJSON_Delete(items);
            cJSON_Delete(preparationSteps);
            return false;
        }

        const auto addOptionalString = [item](const char* key,
                                              const std::optional<std::string>& value) {
            return value ? cJSON_AddStringToObject(item, key, value->c_str()) != nullptr
                         : cJSON_AddNullToObject(item, key) != nullptr;
        };
        if (!addOptionalString("subtitle", config.subtitle)
            || !addOptionalString("description", config.description)) {
            cJSON_Delete(item);
            cJSON_Delete(items);
            cJSON_Delete(preparationSteps);
            return false;
        }

        for (const PreparationStep& step : config.preparationSteps) {
            cJSON* stepJson = cJSON_CreateObject();
            const char* phase = step.phase == PreparationPhase::BEFORE ? "BEFORE" : "AFTER";
            if (!stepJson
                || !cJSON_AddStringToObject(stepJson, "phase", phase)
                || !cJSON_AddStringToObject(stepJson, "text", step.text.c_str())
                || !cJSON_AddItemToArray(preparationSteps, stepJson)) {
                cJSON_Delete(stepJson);
                cJSON_Delete(item);
                cJSON_Delete(items);
                cJSON_Delete(preparationSteps);
                return false;
            }
        }

        if (!cJSON_AddItemToObject(item, "preparationSteps", preparationSteps)) {
            cJSON_Delete(item);
            cJSON_Delete(items);
            cJSON_Delete(preparationSteps);
            return false;
        }
        preparationSteps = nullptr;
        if (!cJSON_AddItemToObject(item, "items", items)) {
            cJSON_Delete(item);
            cJSON_Delete(items);
            return false;
        }
        items = nullptr;
        if (!cJSON_AddItemToArray(root.get(), item)) {
            cJSON_Delete(item);
            return false;
        }
    }

    JsonStringPtr printed(cJSON_PrintUnformatted(root.get()), cJSON_free);
    if (!printed) {
        return false;
    }

    json = printed.get();
    return true;
}

bool RecipeConfigRepository::deserialize(
    const std::string& json,
    std::vector<RecipeConfig>& configs) const
{
    JsonPtr root(cJSON_ParseWithLength(json.data(), json.size()), cJSON_Delete);
    if (!root || !cJSON_IsArray(root.get())) {
        return false;
    }

    std::vector<RecipeConfig> parsed;
    const cJSON* item = nullptr;
    cJSON_ArrayForEach(item, root.get()) {
        const cJSON* id = cJSON_IsObject(item)
            ? cJSON_GetObjectItemCaseSensitive(item, "id")
            : nullptr;
        const cJSON* name = cJSON_IsObject(item)
            ? cJSON_GetObjectItemCaseSensitive(item, "name")
            : nullptr;
        const cJSON* imageKey = cJSON_IsObject(item)
            ? cJSON_GetObjectItemCaseSensitive(item, "imageKey")
            : nullptr;
        const cJSON* subtitle = cJSON_IsObject(item)
            ? cJSON_GetObjectItemCaseSensitive(item, "subtitle")
            : nullptr;
        const cJSON* description = cJSON_IsObject(item)
            ? cJSON_GetObjectItemCaseSensitive(item, "description")
            : nullptr;
        const cJSON* baseSize = cJSON_IsObject(item)
            ? cJSON_GetObjectItemCaseSensitive(item, "baseSizeMl")
            : nullptr;
        const cJSON* preparationSteps = cJSON_IsObject(item)
            ? cJSON_GetObjectItemCaseSensitive(item, "preparationSteps")
            : nullptr;
        const cJSON* items = cJSON_IsObject(item)
            ? cJSON_GetObjectItemCaseSensitive(item, "items")
            : nullptr;
        if (!isUint16(id) || !cJSON_IsString(name) || name->valuestring == nullptr
            || !cJSON_IsArray(items)) {
            return false;
        }

        std::optional<std::string> parsedImageKey;
        if (imageKey != nullptr && !cJSON_IsNull(imageKey)) {
            if (!cJSON_IsString(imageKey) || imageKey->valuestring == nullptr) {
                return false;
            }
            parsedImageKey = imageKey->valuestring;
        }

        const auto readOptionalString = [](const cJSON* value,
                                           std::optional<std::string>& result) {
            result.reset();
            if (!value || cJSON_IsNull(value)) {
                return true;
            }
            if (!cJSON_IsString(value) || !value->valuestring) {
                return false;
            }
            result = value->valuestring;
            return true;
        };
        std::optional<std::string> parsedSubtitle;
        std::optional<std::string> parsedDescription;
        if (!readOptionalString(subtitle, parsedSubtitle)
            || !readOptionalString(description, parsedDescription)) {
            return false;
        }

        std::uint16_t parsedBaseSize = 400;
        if (baseSize) {
            if (!isUint16(baseSize) || baseSize->valuedouble == 0) {
                return false;
            }
            parsedBaseSize = static_cast<std::uint16_t>(baseSize->valuedouble);
        }

        std::vector<PreparationStep> parsedSteps;
        if (preparationSteps) {
            if (!cJSON_IsArray(preparationSteps)) {
                return false;
            }
            const cJSON* stepJson = nullptr;
            cJSON_ArrayForEach(stepJson, preparationSteps) {
                const cJSON* phase = cJSON_IsObject(stepJson)
                    ? cJSON_GetObjectItemCaseSensitive(stepJson, "phase") : nullptr;
                const cJSON* text = cJSON_IsObject(stepJson)
                    ? cJSON_GetObjectItemCaseSensitive(stepJson, "text") : nullptr;
                if (!cJSON_IsString(phase) || !phase->valuestring
                    || !cJSON_IsString(text) || !text->valuestring
                    || text->valuestring[0] == '\0') {
                    return false;
                }
                const std::string phaseText = phase->valuestring;
                if (phaseText != "BEFORE" && phaseText != "AFTER") {
                    return false;
                }
                parsedSteps.push_back({
                    .phase = phaseText == "BEFORE" ? PreparationPhase::BEFORE
                                                    : PreparationPhase::AFTER,
                    .text = text->valuestring,
                });
            }
        }

        const std::uint16_t recipeId = static_cast<std::uint16_t>(id->valuedouble);
        const auto duplicateId = std::find_if(
            parsed.begin(),
            parsed.end(),
            [recipeId](const RecipeConfig& stored) { return stored.id == recipeId; });
        if (duplicateId != parsed.end()) {
            return false;
        }

        std::vector<RecipeItem> parsedItems;
        const cJSON* jsonItem = nullptr;
        cJSON_ArrayForEach(jsonItem, items) {
            const cJSON* ingredientId = cJSON_IsObject(jsonItem)
                ? cJSON_GetObjectItemCaseSensitive(jsonItem, "ingredientId")
                : nullptr;
            const cJSON* amountMl = cJSON_IsObject(jsonItem)
                ? cJSON_GetObjectItemCaseSensitive(jsonItem, "amountMl")
                : nullptr;
            if (!isUint16(ingredientId) || !isUint16(amountMl)) {
                return false;
            }

            parsedItems.push_back({
                .ingredientId = static_cast<std::uint16_t>(ingredientId->valuedouble),
                .amountMl = static_cast<std::uint16_t>(amountMl->valuedouble),
            });
        }

        parsed.push_back({
            .id = recipeId,
            .name = name->valuestring,
            .imageKey = std::move(parsedImageKey),
            .subtitle = std::move(parsedSubtitle),
            .description = std::move(parsedDescription),
            .baseSizeMl = parsedBaseSize,
            .preparationSteps = std::move(parsedSteps),
            .items = std::move(parsedItems),
        });
    }

    configs = std::move(parsed);
    return true;
}

bool RecipeConfigRepository::generateId(
    const std::vector<RecipeConfig>& configs,
    std::uint16_t& id) const
{
    std::vector<std::uint16_t> usedIds;
    usedIds.reserve(configs.size());
    for (const RecipeConfig& config : configs) {
        if (config.id != 0) {
            usedIds.push_back(config.id);
        }
    }
    std::sort(usedIds.begin(), usedIds.end());

    std::uint32_t candidate = 1;
    for (const std::uint16_t usedId : usedIds) {
        if (usedId == candidate) {
            ++candidate;
        } else if (usedId > candidate) {
            break;
        }
    }

    if (candidate > std::numeric_limits<std::uint16_t>::max()) {
        return false;
    }

    id = static_cast<std::uint16_t>(candidate);
    return true;
}
