export interface Recipe {
  id: string; machineRecipeId: number; name: string; subtitle: string; description: string;
  imageKey: string; imageUrl: string; ingredients: string[];
  ingredientAmounts: { name: string; amountMl: number; packageMl: number; category: "alcohol" | "mixer"; machineDispensed: boolean }[];
  preparation: string[]; available: boolean;
}
export interface PublicEvent {
  slug: string; title: string; hostName: string; date: string | null; mode: "planning" | "live";
  machineConnected: boolean; machineOnline?: boolean;
}
export interface DrinkRequest {
  id: string; guestName: string; recipeId: string | null; recipeName: string;
  note: string | null; createdAt: string;
}
export interface QueueEntry {
  id: string; guestName: string; recipeId: string; recipeName: string; sizeMl: number;
  strength: "less" | "standard" | "more"; status: string; createdAt: string;
}
export interface EventData { event: PublicEvent; recipes: Recipe[]; }
export interface HostData {
  event: PublicEvent; requests: DrinkRequest[]; queue: QueueEntry[];
  machine: null | { id: string; name: string; online: boolean; lastSeen: string | null };
  shoppingList: { key: string; name: string; amountMl: number; packageMl: number; packages: number; drinks: number; category: "alcohol" | "mixer"; machineDispensed: boolean }[];
  pumpPlan: { requiredPumps: number; automaticIngredients: string[]; manualIngredients: string[] };
  checkedShoppingKeys: string[];
}
