export type BackendErrorKey =
  | "no_glass"
  | "glass_removed"
  | "ingredient_not_available"
  | "pump_not_calibrated"
  | "machine_busy"
  | "start_failed"
  | "recipe_not_found"
  | "strength_not_supported"
  | "invalid_size"
  | "image_in_use"
  | "media_storage_full"
  | "image_too_large"
  | "unsupported_image_type"
  | "no_saved_network"
  | "disconnect_failed"
  | "invalid_device_settings";

export interface UserMessage {
  title: string;
  message: string;
}

export const backendErrorMessages: Record<BackendErrorKey, UserMessage> = {
  no_glass: {
    title: "No glass detected",
    message: "Place glass and retry.",
  },
  glass_removed: {
    title: "Glass removed",
    message: "Preparation is paused. Put the glass back to continue.",
  },
  ingredient_not_available: {
    title: "Ingredient unavailable",
    message: "One of the required ingredients is not assigned to a pump.",
  },
  pump_not_calibrated: {
    title: "Pump needs calibration",
    message: "One of the required pumps has not been calibrated yet.",
  },
  machine_busy: {
    title: "Machine is busy",
    message: "Wait for the current operation to finish.",
  },
  start_failed: {
    title: "Could not start drink",
    message: "The machine could not start this drink. Please try again.",
  },
  recipe_not_found: {
    title: "Recipe unavailable",
    message: "This recipe no longer exists on the machine.",
  },
  strength_not_supported: {
    title: "Strength cannot be adjusted",
    message: "Check that at least one ingredient is categorized as alcohol.",
  },
  invalid_size: {
    title: "Drink size unavailable",
    message: "Choose one of the sizes configured for this machine.",
  },
  image_in_use: {
    title: "Image is still in use",
    message: "Remove the image from its recipe before deleting it.",
  },
  media_storage_full: {
    title: "Image storage is full",
    message: "Remove an unused uploaded image before trying again.",
  },
  image_too_large: {
    title: "Image is too large",
    message: "Choose a smaller image and try again.",
  },
  unsupported_image_type: {
    title: "Image format unsupported",
    message: "Choose an image that this browser can open.",
  },
  no_saved_network: {
    title: "No saved network",
    message: "Choose a Wi-Fi network to connect Neat.",
  },
  disconnect_failed: {
    title: "Could not disconnect",
    message: "Neat could not leave the current Wi-Fi network.",
  },
  invalid_device_settings: {
    title: "Settings are not valid",
    message: "Check the sizes, default size and strength values.",
  },
};

export class ApiError extends Error {
  readonly status: number;
  readonly key: string;

  constructor(status: number, key: string) {
    super(key);
    this.name = "ApiError";
    this.status = status;
    this.key = key;
  }
}

export function messageForError(error: unknown): UserMessage {
  const key = error instanceof ApiError ? error.key : "";
  if (key in backendErrorMessages) {
    return backendErrorMessages[key as BackendErrorKey];
  }
  return {
    title: "Something went wrong",
    message: "Please try again.",
  };
}
