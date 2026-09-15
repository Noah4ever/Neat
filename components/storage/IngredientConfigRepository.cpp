#include "storage/IngredientConfigRepository.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <memory>
#include <utility>

#include "FileStorageUtils.hpp"
#include "cJSON.h"

namespace {

constexpr char kConfigPath[] = "/storage/ingredients.json";

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

const char* categoryName(IngredientCategory category)
{
    switch (category) {
    case IngredientCategory::ALCOHOL: return "ALCOHOL";
    case IngredientCategory::JUICE: return "JUICE";
    case IngredientCategory::MIXER: return "MIXER";
    case IngredientCategory::SYRUP: return "SYRUP";
    case IngredientCategory::OTHER: return "OTHER";
    }
    return "OTHER";
}

bool readCategory(const cJSON* value, IngredientCategory& category)
{
    category = IngredientCategory::OTHER;
    if (!value || cJSON_IsNull(value)) return true;
    if (!cJSON_IsString(value) || !value->valuestring) return false;
    const std::string name = value->valuestring;
    if (name == "ALCOHOL") category = IngredientCategory::ALCOHOL;
    else if (name == "JUICE") category = IngredientCategory::JUICE;
    else if (name == "MIXER") category = IngredientCategory::MIXER;
    else if (name == "SYRUP") category = IngredientCategory::SYRUP;
    else if (name == "OTHER") category = IngredientCategory::OTHER;
    else return false;
    return true;
}

} // namespace

IngredientConfigRepository::IngredientConfigRepository()
    : mounted_(storage_internal::mountFileSystem())
{
}

std::vector<IngredientConfig> IngredientConfigRepository::loadAll()
{
    std::vector<IngredientConfig> configs;
    if (!readAll(configs)) {
        configs.clear();
    }
    return configs;
}

std::optional<IngredientConfig> IngredientConfigRepository::findById(std::uint16_t id)
{
    std::vector<IngredientConfig> configs;
    if (!readAll(configs)) {
        return std::nullopt;
    }

    const auto config = std::find_if(
        configs.begin(),
        configs.end(),
        [id](const IngredientConfig& stored) { return stored.id == id; });
    return config == configs.end()
        ? std::nullopt
        : std::optional<IngredientConfig>{*config};
}

std::optional<IngredientConfig> IngredientConfigRepository::create(
    const std::string& name, IngredientCategory category)
{
    std::vector<IngredientConfig> configs;
    if (!readAll(configs)) {
        return std::nullopt;
    }

    const auto duplicateName = std::find_if(
        configs.begin(),
        configs.end(),
        [&name](const IngredientConfig& stored) { return stored.name == name; });
    if (duplicateName != configs.end()) {
        return std::nullopt;
    }

    std::uint16_t id = 0;
    if (!generateId(configs, id)) {
        return std::nullopt;
    }

    IngredientConfig config{.id = id, .name = name, .category = category};
    configs.push_back(config);
    if (!saveAll(configs)) {
        return std::nullopt;
    }

    return config;
}

bool IngredientConfigRepository::update(const IngredientConfig& config)
{
    std::vector<IngredientConfig> configs;
    if (!readAll(configs)) {
        return false;
    }

    const auto existing = std::find_if(
        configs.begin(),
        configs.end(),
        [&config](const IngredientConfig& stored) { return stored.id == config.id; });
    if (existing == configs.end()) {
        return false;
    }

    const auto duplicateName = std::find_if(
        configs.begin(),
        configs.end(),
        [&config](const IngredientConfig& stored) {
            return stored.id != config.id && stored.name == config.name;
        });
    if (duplicateName != configs.end()) {
        return false;
    }

    *existing = config;
    return saveAll(configs);
}

bool IngredientConfigRepository::remove(std::uint16_t id)
{
    std::vector<IngredientConfig> configs;
    if (!readAll(configs)) {
        return false;
    }

    const auto existing = std::find_if(
        configs.begin(),
        configs.end(),
        [id](const IngredientConfig& stored) { return stored.id == id; });
    if (existing == configs.end()) {
        return false;
    }

    configs.erase(existing);
    return saveAll(configs);
}

bool IngredientConfigRepository::readAll(std::vector<IngredientConfig>& configs) const
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

bool IngredientConfigRepository::saveAll(
    const std::vector<IngredientConfig>& configs) const
{
    if (!mounted_) {
        return false;
    }

    std::string json;
    return serialize(configs, json)
        && storage_internal::writeTextFile(kConfigPath, json);
}

bool IngredientConfigRepository::serialize(
    const std::vector<IngredientConfig>& configs,
    std::string& json) const
{
    JsonPtr root(cJSON_CreateArray(), cJSON_Delete);
    if (!root) {
        return false;
    }

    for (const IngredientConfig& config : configs) {
        cJSON* item = cJSON_CreateObject();
        if (item == nullptr) {
            return false;
        }

        if (cJSON_AddNumberToObject(item, "id", config.id) == nullptr
            || cJSON_AddStringToObject(item, "name", config.name.c_str()) == nullptr
            || cJSON_AddStringToObject(item, "category", categoryName(config.category)) == nullptr
            || !cJSON_AddItemToArray(root.get(), item)) {
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

bool IngredientConfigRepository::deserialize(
    const std::string& json,
    std::vector<IngredientConfig>& configs) const
{
    JsonPtr root(cJSON_ParseWithLength(json.data(), json.size()), cJSON_Delete);
    if (!root || !cJSON_IsArray(root.get())) {
        return false;
    }

    std::vector<IngredientConfig> parsed;
    const cJSON* item = nullptr;
    cJSON_ArrayForEach(item, root.get()) {
        const cJSON* id = cJSON_IsObject(item)
            ? cJSON_GetObjectItemCaseSensitive(item, "id")
            : nullptr;
        const cJSON* name = cJSON_IsObject(item)
            ? cJSON_GetObjectItemCaseSensitive(item, "name")
            : nullptr;
        const cJSON* category = cJSON_IsObject(item)
            ? cJSON_GetObjectItemCaseSensitive(item, "category")
            : nullptr;
        if (!isUint16(id) || !cJSON_IsString(name) || name->valuestring == nullptr) {
            return false;
        }

        const std::uint16_t ingredientId = static_cast<std::uint16_t>(id->valuedouble);
        const auto duplicateId = std::find_if(
            parsed.begin(),
            parsed.end(),
            [ingredientId](const IngredientConfig& stored) {
                return stored.id == ingredientId;
            });
        const auto duplicateName = std::find_if(
            parsed.begin(),
            parsed.end(),
            [name](const IngredientConfig& stored) {
                return stored.name == name->valuestring;
            });
        if (duplicateId != parsed.end() || duplicateName != parsed.end()) {
            return false;
        }

        IngredientCategory parsedCategory = IngredientCategory::OTHER;
        if (!readCategory(category, parsedCategory)) {
            return false;
        }
        parsed.push_back({.id = ingredientId,
                          .name = name->valuestring,
                          .category = parsedCategory});
    }

    configs = std::move(parsed);
    return true;
}

bool IngredientConfigRepository::generateId(
    const std::vector<IngredientConfig>& configs,
    std::uint16_t& id) const
{
    std::vector<std::uint16_t> usedIds;
    usedIds.reserve(configs.size());
    for (const IngredientConfig& config : configs) {
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
