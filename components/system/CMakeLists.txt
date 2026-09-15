idf_component_register(
    SRCS "SystemMonitor.cpp"
    INCLUDE_DIRS "include"
    PRIV_REQUIRES wifi media freertos esp_timer heap spiffs app_update bootloader_support esp_wifi
)
