idf_component_register(
    SRCS
        "Pump.cpp"
        "PumpControl.cpp"
        "Calibration.cpp"

    INCLUDE_DIRS
        "include"

    REQUIRES
      io
      esp_timer
)