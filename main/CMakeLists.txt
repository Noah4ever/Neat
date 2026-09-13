idf_component_register(
    SRCS
        "main.cpp"

    INCLUDE_DIRS
        "."

    PRIV_REQUIRES
        api
        machine
        pump
        io
        storage
)
