export type PartyMode = "planning" | "live";

export interface CloudConfig {
  restBaseUrl: string;
  websocketUrl: string;
  publicSiteUrl: string;
  machineId: string;
}

export interface CloudMachine {
  id: string;
  name: string;
  online: boolean;
  mode: PartyMode;
  partyId: string | null;
  partyName: string | null;
  location: string | null;
  startsAt: string | null;
}

export interface CloudRecipe {
  id: string;
  machineRecipeId: number | null;
  name: string;
  subtitle: string;
  description: string;
  imageKey: string | null;
  imageUrl: string | null;
  available: boolean;
}

export interface CloudQueueEntry {
  id: string;
  guestName: string;
  recipeId: string;
  machineRecipeId: number | null;
  recipeName: string;
  sizeMl: number;
  strength: "less" | "standard" | "more";
  status: "waiting" | "claimed" | "completed" | "cancelled";
  createdAt: string;
}
