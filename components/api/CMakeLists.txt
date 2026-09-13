idf_component_register(
    SRCS "API.cpp"
    INCLUDE_DIRS "include"
    REQUIRES
      esp_http_server
      machine
      pump
      wifi
      storage
    PRIV_REQUIRES
      espressif__cjson
      spiffs
)

spiffs_create_partition_image(web ${CMAKE_SOURCE_DIR}/frontend/dist FLASH_IN_PROJECT)
