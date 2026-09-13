export interface Ingredient {
  id: number;
  name: string;
}
export interface RecipeItem {
  ingredientId: number;
  amountMl: number;
}
export interface RecipeRecord {
  id: number;
  name: string;
  items: RecipeItem[];
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
  address: string;
  networks: { ssid: string; secured: boolean; rssi: number }[];
}
export interface OperationStatus {
  state: "idle" | "running" | "finished" | "stopped";
  kind?: "drink" | "cleaning" | "calibration";
  progress: number;
  label?: string;
  recipeId?: number;
}
