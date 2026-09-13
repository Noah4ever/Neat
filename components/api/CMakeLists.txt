idf_component_register(
    SRCS "API.cpp"
    INCLUDE_DIRS "include"
    REQUIRES
      esp_http_server
      machine
      storage
)