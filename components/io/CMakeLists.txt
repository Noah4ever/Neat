idf_component_register(
    SRCS
        "GPIOOutput.cpp"
        "Button.cpp"
        "LED.cpp"
        "Buzzer.cpp"

    INCLUDE_DIRS
        "include"

    REQUIRES
        esp_driver_gpio

    PRIV_REQUIRES
        esp_driver_ledc
        esp_timer
)