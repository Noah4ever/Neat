#include "media/MediaStorage.hpp"

#include <algorithm>
#include <array>
#include <cstdio>
#include <string>

#include "esp_random.h"
#include "esp_spiffs.h"

namespace {
constexpr char kLabel[] = "media";
constexpr char kBasePath[] = "/media";
}

MediaStorage::MediaStorage() : mounted_(false) {
  const esp_vfs_spiffs_conf_t config = {
      .base_path = kBasePath,
      .partition_label = kLabel,
      .max_files = 8,
      .format_if_mount_failed = true};
  mounted_ = esp_vfs_spiffs_register(&config) == ESP_OK;
}

bool MediaStorage::ready() const { return mounted_; }

bool MediaStorage::validImageId(const std::string &id) {
  if (id.size() != 16) return false;
  return id.find_first_not_of("0123456789abcdef") == std::string::npos;
}

std::string MediaStorage::generateImageId() const {
  char id[17] = {};
  std::snprintf(id, sizeof(id), "%08lx%08lx",
                static_cast<unsigned long>(esp_random()),
                static_cast<unsigned long>(esp_random()));
  return id;
}

std::string MediaStorage::imagePath(const std::string &id) const {
  return std::string(kBasePath) + "/" + id + ".webp";
}

bool MediaStorage::storeImage(
    const std::string &id, std::size_t size,
    const std::function<int(char *, std::size_t)> &readChunk) {
  if (!mounted_ || !validImageId(id) || size == 0 || size > MAX_IMAGE_BYTES) {
    return false;
  }
  const std::string finalPath = imagePath(id);
  const std::string temporaryPath = finalPath + ".tmp";
  FILE *file = std::fopen(temporaryPath.c_str(), "wb");
  if (!file) return false;

  std::array<char, 2048> buffer{};
  std::size_t remaining = size;
  bool success = true;
  while (remaining > 0) {
    const std::size_t wanted = std::min(remaining, buffer.size());
    const int received = readChunk(buffer.data(), wanted);
    if (received <= 0 || static_cast<std::size_t>(received) > wanted ||
        std::fwrite(buffer.data(), 1, static_cast<std::size_t>(received), file) !=
            static_cast<std::size_t>(received)) {
      success = false;
      break;
    }
    remaining -= static_cast<std::size_t>(received);
  }
  success = std::fclose(file) == 0 && success && remaining == 0;
  if (!success || std::rename(temporaryPath.c_str(), finalPath.c_str()) != 0) {
    std::remove(temporaryPath.c_str());
    return false;
  }
  return true;
}

bool MediaStorage::removeImage(const std::string &id) {
  return mounted_ && validImageId(id) &&
         std::remove(imagePath(id).c_str()) == 0;
}

bool MediaStorage::imageExists(const std::string &id) const {
  if (!mounted_ || !validImageId(id)) return false;
  FILE *file = std::fopen(imagePath(id).c_str(), "rb");
  if (!file) return false;
  std::fclose(file);
  return true;
}

MediaStorageInfo MediaStorage::info() const {
  std::size_t total = 0;
  std::size_t used = 0;
  if (!mounted_ || esp_spiffs_info(kLabel, &total, &used) != ESP_OK) {
    return {};
  }
  return {.totalBytes = total, .usedBytes = used};
}
