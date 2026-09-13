idf_component_register(
    SRCS
        "WiFiController.cpp"

    INCLUDE_DIRS
        "include"

    REQUIRES
        esp_event
        esp_common

    PRIV_REQUIRES
        esp_wifi
        esp_netif
        nvs_flash
)