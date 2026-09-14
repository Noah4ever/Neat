idf_component_register(
    SRCS "API.cpp"
    INCLUDE_DIRS "include"
    REQUIRES
      esp_http_server
      machine
      pump
      wifi
      storage
      bottle
      settings
    PRIV_REQUIRES
      espressif__cjson
      esp_app_format
      esp_netif
      spiffs
)

spiffs_create_partition_image(web ${CMAKE_SOURCE_DIR}/frontend/dist FLASH_IN_PROJECT)
