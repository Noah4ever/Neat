#pragma once

#include <cstddef>
#include <functional>
#include <string>

struct MediaStorageInfo {
  std::size_t totalBytes;
  std::size_t usedBytes;
};

class MediaStorage {
public:
  static constexpr std::size_t MAX_IMAGE_BYTES = 512 * 1024;

  MediaStorage();
  bool ready() const;
  bool storeImage(const std::string &id, std::size_t size,
                  const std::function<int(char *, std::size_t)> &readChunk);
  bool removeImage(const std::string &id);
  bool imageExists(const std::string &id) const;
  std::string generateImageId() const;
  std::string imagePath(const std::string &id) const;
  MediaStorageInfo info() const;

  static bool validImageId(const std::string &id);

private:
  bool mounted_;
};
