#pragma once

#include <string>

namespace storage_internal {

bool mountFileSystem();
bool readTextFile(const char* path, std::string& content, bool& exists);
bool writeTextFile(const char* path, const std::string& content);

} // namespace storage_internal
