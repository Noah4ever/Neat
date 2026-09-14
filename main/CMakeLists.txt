idf_component_register(
    SRCS
        "main.cpp"

    INCLUDE_DIRS
        "."

    PRIV_REQUIRES
        api
        wifi
        machine
        pump
        io
        sensor
        feedback
        storage
        settings
        bottle
        nvs_flash
)
