idf_component_register(
    SRCS
        "FeedbackControl.cpp"

    INCLUDE_DIRS
        "include"

    PRIV_REQUIRES esp_driver_gpio

    REQUIRES
        io
        settings
)
