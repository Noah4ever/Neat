idf_component_register(
    SRCS
        "FileStorageUtils.cpp"
        "IngredientConfigRepository.cpp"
        "PumpConfigRepository.cpp"
        "RecipeConfigRepository.cpp"

    INCLUDE_DIRS
        "include"

    REQUIRES
        ingredient
        pump
        recipe
        spiffs
)

spiffs_create_partition_image(storage ../../storage FLASH_IN_PROJECT)
