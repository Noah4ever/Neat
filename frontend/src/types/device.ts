export type IngredientCategory =
  "ALCOHOL" | "JUICE" | "MIXER" | "SYRUP" | "OTHER";

export interface Ingredient {
  id: number;
  name: string;
  category: IngredientCategory;
}
export interface RecipeItem {
  ingredientId: number;
  amountMl: number;
}
export interface PreparationStep {
  phase: "BEFORE" | "AFTER";
  text: string;
}
export interface RecipeAvailability {
  available: boolean;
  missingIngredientIds: number[];
  uncalibratedIngredientIds: number[];
}
export interface RecipeRecord {
  id: number;
  name: string;
  imageKey: string | null;
  subtitle: string | null;
  description: string | null;
  baseSizeMl: number;
  preparationSteps: PreparationStep[];
  items: RecipeItem[];
  availability: RecipeAvailability;
  strengthAdjustmentAvailable: boolean;
}
export interface PumpConfig {
  id: number;
  ingredientId: number | null;
  mlPerSec: number | null;
  output: { type: 0; channel: number };
}
export interface DeviceInfo {
  name: string;
  model: string;
  version: string;
}
export interface NetworkInfo {
  connected: boolean;
  ssid: string | null;
  accessPoint: string;
  accessPointPassword: string;
  address: string;
  networks: { ssid: string; secured: boolean; rssi: number }[];
}
export interface OperationStatus {
  state: "idle" | "running" | "paused" | "finished" | "stopped";
  kind?: "drink" | "cleaning" | "calibration";
  progress: number;
  label?: string;
  recipeId?: number;
  glassPresent: boolean;
  completedIngredientIds?: number[];
}
export interface DeviceSettings {
  activateLedWhenPumpActive: boolean;
  requireGlassDetection: boolean;
  drinkSizesMl: number[];
  defaultDrinkSizeMl: number;
  alcoholStrengthLessFactor: number;
  alcoholStrengthMoreFactor: number;
}
export interface BottleState {
  pumpId: number;
  capacityMl: number;
  remainingMl: number;
}
export interface StorageArea {
  totalBytes: number;
  usedBytes: number;
}
export interface SystemStatus {
  uptimeMs: number;
  memory: {
    freeHeapBytes: number;
    minimumFreeHeapBytes: number;
    largestFreeBlockBytes: number;
  };
  cpu: { utilizationPercent: number };
  storage: {
    firmware: StorageArea;
    frontend: StorageArea;
    configuration: StorageArea;
    media: StorageArea;
  };
  network: {
    mode: string;
    stationConnected: boolean;
    rssi: number | null;
    accessPointActive: boolean;
  };
}
export interface DeveloperStatus {
  glassPresent: boolean;
  machine: {
    kind: "none" | "drink" | "cleaning" | "calibration";
    state: OperationStatus["state"];
    busy: boolean;
  };
  pumps: (PumpConfig & { running: boolean })[];
  bottles: BottleState[];
}
