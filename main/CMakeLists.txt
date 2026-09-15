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
        media
        system
        developer
        nvs_flash
)
