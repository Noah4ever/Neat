idf_component_register(
    SRCS "MachineLogic.cpp" "RecipePlanner.cpp"
    INCLUDE_DIRS "include"
    REQUIRES pump recipe ingredient storage sensor feedback settings bottle
    PRIV_REQUIRES esp_timer
)
