idf_component_register(
    SRCS "MachineLogic.cpp"
    INCLUDE_DIRS "include"
    REQUIRES pump recipe storage sensor feedback settings bottle
    PRIV_REQUIRES esp_timer
)
