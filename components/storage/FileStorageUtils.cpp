#include "FileStorageUtils.hpp"

#include <cerrno>
#include <cstdio>
#include <string>

#include "esp_err.h"
#include "esp_spiffs.h"

namespace {

constexpr char kPartitionLabel[] = "storage";
constexpr char kBasePath[] = "/storage";

} // namespace

namespace storage_internal {

bool mountFileSystem()
{
    if (esp_spiffs_mounted(kPartitionLabel)) {
        return true;
    }

    const esp_vfs_spiffs_conf_t config = {
        .base_path = kBasePath,
        .partition_label = kPartitionLabel,
        .max_files = 2,
        .format_if_mount_failed = true,
    };

    return esp_vfs_spiffs_register(&config) == ESP_OK;
}

bool readTextFile(const char* path, std::string& content, bool& exists)
{
    content.clear();
    exists = false;

    FILE* file = std::fopen(path, "rb");
    if (file == nullptr) {
        return errno == ENOENT;
    }
    exists = true;

    if (std::fseek(file, 0, SEEK_END) != 0) {
        std::fclose(file);
        return false;
    }

    const long size = std::ftell(file);
    if (size < 0 || std::fseek(file, 0, SEEK_SET) != 0) {
        std::fclose(file);
        return false;
    }

    content.resize(static_cast<std::size_t>(size));
    const std::size_t bytesRead = content.empty()
        ? 0
        : std::fread(content.data(), 1, content.size(), file);
    const bool readSucceeded = bytesRead == content.size() && std::ferror(file) == 0;
    std::fclose(file);
    return readSucceeded;
}

bool writeTextFile(const char* path, const std::string& content)
{
    const std::string temporaryPath = std::string(path) + ".tmp";
    FILE* file = std::fopen(temporaryPath.c_str(), "wb");
    if (file == nullptr) {
        return false;
    }

    const bool writeSucceeded =
        std::fwrite(content.data(), 1, content.size(), file) == content.size();
    const bool flushSucceeded = std::fflush(file) == 0;
    const bool closeSucceeded = std::fclose(file) == 0;

    if (!writeSucceeded || !flushSucceeded || !closeSucceeded) {
        std::remove(temporaryPath.c_str());
        return false;
    }

    std::remove(path);
    if (std::rename(temporaryPath.c_str(), path) != 0) {
        std::remove(temporaryPath.c_str());
        return false;
    }

    return true;
}

} // namespace storage_internal
