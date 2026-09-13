#include "storage/PumpConfigRepository.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <memory>
#include <type_traits>
#include <utility>

#include "FileStorageUtils.hpp"
#include "cJSON.h"

namespace {

constexpr char kConfigPath[] = "/storage/pumps.json";

using JsonPtr = std::unique_ptr<cJSON, decltype(&cJSON_Delete)>;
using JsonStringPtr = std::unique_ptr<char, decltype(&cJSON_free)>;

bool isUint8(const cJSON* value)
{
    if (!cJSON_IsNumber(value) || !std::isfinite(value->valuedouble)) {
        return false;
    }

    return value->valuedouble >= 0.0
        && value->valuedouble <= std::numeric_limits<std::uint8_t>::max()
        && std::floor(value->valuedouble) == value->valuedouble;
}

bool isUint16(const cJSON* value)
{
    if (!cJSON_IsNumber(value) || !std::isfinite(value->valuedouble)) {
        return false;
    }

    return value->valuedouble >= 0.0
        && value->valuedouble <= std::numeric_limits<std::uint16_t>::max()
        && std::floor(value->valuedouble) == value->valuedouble;
}

} // namespace

PumpConfigRepository::PumpConfigRepository()
    : mounted_(storage_internal::mountFileSystem())
{
}

std::vector<PumpConfig> PumpConfigRepository::loadAll()
{
    std::vector<PumpConfig> configs;
    if (!readAll(configs)) {
        configs.clear();
    }
    return configs;
}

std::optional<PumpConfig> PumpConfigRepository::findById(std::uint8_t id)
{
    std::vector<PumpConfig> configs;
    if (!readAll(configs)) {
        return std::nullopt;
    }

    const auto config = std::find_if(
        configs.begin(),
        configs.end(),
        [id](const PumpConfig& stored) { return stored.id == id; });
    return config == configs.end()
        ? std::nullopt
        : std::optional<PumpConfig>{*config};
}

bool PumpConfigRepository::add(const PumpConfig& config)
{
    std::vector<PumpConfig> configs;
    if (!readAll(configs)) {
        return false;
    }

    const auto existing = std::find_if(
        configs.begin(),
        configs.end(),
        [&config](const PumpConfig& stored) { return stored.id == config.id; });

    if (existing != configs.end()) {
        return false;
    }

    configs.push_back(config);
    return saveAll(configs);
}

bool PumpConfigRepository::update(const PumpConfig& config)
{
    std::vector<PumpConfig> configs;
    if (!readAll(configs)) {
        return false;
    }

    const auto existing = std::find_if(
        configs.begin(),
        configs.end(),
        [&config](const PumpConfig& stored) { return stored.id == config.id; });

    if (existing == configs.end()) {
        return false;
    }

    *existing = config;
    return saveAll(configs);
}

bool PumpConfigRepository::remove(std::uint8_t id)
{
    std::vector<PumpConfig> configs;
    if (!readAll(configs)) {
        return false;
    }

    const auto existing = std::find_if(
        configs.begin(),
        configs.end(),
        [id](const PumpConfig& stored) { return stored.id == id; });

    if (existing == configs.end()) {
        return false;
    }

    configs.erase(existing);
    return saveAll(configs);
}

bool PumpConfigRepository::readAll(std::vector<PumpConfig>& configs) const
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

bool PumpConfigRepository::saveAll(const std::vector<PumpConfig>& configs) const
{
    if (!mounted_) {
        return false;
    }

    std::string json;
    if (!serialize(configs, json)) {
        return false;
    }

    return storage_internal::writeTextFile(kConfigPath, json);
}

bool PumpConfigRepository::serialize(
    const std::vector<PumpConfig>& configs,
    std::string& json) const
{
    JsonPtr root(cJSON_CreateArray(), cJSON_Delete);
    if (!root) {
        return false;
    }

    using OutputTypeValue = std::underlying_type_t<OutputChannelType>;

    for (const PumpConfig& config : configs) {
        cJSON* item = cJSON_CreateObject();
        cJSON* output = cJSON_CreateObject();
        if (item == nullptr || output == nullptr) {
            cJSON_Delete(item);
            cJSON_Delete(output);
            return false;
        }

        if (cJSON_AddNumberToObject(item, "id", config.id) == nullptr
            || (config.mlPerSec
                    ? cJSON_AddNumberToObject(item, "mlPerSec", *config.mlPerSec) == nullptr
                    : cJSON_AddNullToObject(item, "mlPerSec") == nullptr)
            || (config.ingredientId
                    ? cJSON_AddNumberToObject(
                          item, "ingredientId", *config.ingredientId) == nullptr
                    : cJSON_AddNullToObject(item, "ingredientId") == nullptr)
            || cJSON_AddNumberToObject(
                    output,
                    "type",
                    static_cast<OutputTypeValue>(config.outputConfig.type)) == nullptr
            || cJSON_AddNumberToObject(output, "channel", config.outputConfig.channel) == nullptr
            || !cJSON_AddItemToObject(item, "output", output)) {
            cJSON_Delete(item);
            cJSON_Delete(output);
            return false;
        }

        output = nullptr;
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

bool PumpConfigRepository::deserialize(
    const std::string& json,
    std::vector<PumpConfig>& configs) const
{
    JsonPtr root(cJSON_ParseWithLength(json.data(), json.size()), cJSON_Delete);
    if (!root || !cJSON_IsArray(root.get())) {
        return false;
    }

    std::vector<PumpConfig> parsed;
    const cJSON* item = nullptr;
    cJSON_ArrayForEach(item, root.get()) {
        if (!cJSON_IsObject(item)) {
            return false;
        }

        const cJSON* id = cJSON_GetObjectItemCaseSensitive(item, "id");
        const cJSON* mlPerSec = cJSON_GetObjectItemCaseSensitive(item, "mlPerSec");
        const cJSON* ingredientId =
            cJSON_GetObjectItemCaseSensitive(item, "ingredientId");
        const cJSON* output = cJSON_GetObjectItemCaseSensitive(item, "output");
        const cJSON* type = cJSON_IsObject(output)
            ? cJSON_GetObjectItemCaseSensitive(output, "type")
            : nullptr;
        const cJSON* channel = cJSON_IsObject(output)
            ? cJSON_GetObjectItemCaseSensitive(output, "channel")
            : nullptr;

        if (!isUint8(id) || (!cJSON_IsNull(mlPerSec) && !cJSON_IsNumber(mlPerSec))
            || (cJSON_IsNumber(mlPerSec) && !std::isfinite(mlPerSec->valuedouble))
            || (ingredientId != nullptr
                && !cJSON_IsNull(ingredientId)
                && !isUint16(ingredientId))
            || !isUint8(type) || !isUint8(channel)) {
            return false;
        }

        const auto outputType = static_cast<OutputChannelType>(
            static_cast<std::uint8_t>(type->valuedouble));
        switch (outputType) {
        case OutputChannelType::GPIO:
            break;
        default:
            return false;
        }

        const std::uint8_t pumpId = static_cast<std::uint8_t>(id->valuedouble);
        const auto duplicate = std::find_if(
            parsed.begin(),
            parsed.end(),
            [pumpId](const PumpConfig& stored) { return stored.id == pumpId; });
        if (duplicate != parsed.end()) {
            return false;
        }

        PumpConfig config{
            .id = pumpId,
            .ingredientId = isUint16(ingredientId)
                ? std::optional<std::uint16_t>{
                      static_cast<std::uint16_t>(ingredientId->valuedouble)}
                : std::optional<std::uint16_t>{},
            .mlPerSec = cJSON_IsNull(mlPerSec)
                ? std::optional<float>{}
                : std::optional<float>{static_cast<float>(mlPerSec->valuedouble)},
            .outputConfig = {
                .type = outputType,
                .channel = static_cast<std::uint8_t>(channel->valuedouble),
            },
        };
        parsed.push_back(std::move(config));
    }

    configs = std::move(parsed);
    return true;
}
