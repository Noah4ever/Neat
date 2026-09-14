export type BackendErrorKey =
  | "no_glass"
  | "glass_removed"
  | "ingredient_not_available"
  | "pump_not_calibrated"
  | "machine_busy"
  | "start_failed"
  | "recipe_not_found";

export interface UserMessage {
  title: string;
  message: string;
}

export const backendErrorMessages: Record<BackendErrorKey, UserMessage> = {
  no_glass: {
    title: "No glass detected",
    message: "Place a glass under the dispenser and try again.",
  },
  glass_removed: {
    title: "Glass removed",
    message: "Preparation was stopped because the glass was removed.",
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
