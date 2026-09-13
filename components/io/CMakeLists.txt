idf_component_register(
    SRCS 
      "GPIOOutput.cpp"
    
    INCLUDE_DIRS 
      "include"

    REQUIRES
        esp_driver_gpio
)