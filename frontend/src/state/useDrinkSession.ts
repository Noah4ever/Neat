import { createContext, useContext } from "react";
import type { Cocktail } from "../types/cocktail";
import type { MakeDrinkRequest } from "../services/api";
import type { OperationStatus } from "../types/device";
export type DrinkSession = { cocktail: Cocktail };
export const DrinkSessionContext = createContext<{
  session: DrinkSession | null;
  status: OperationStatus | undefined;
  busy: boolean;
  stopping: boolean;
  start: (cocktail: Cocktail, request: MakeDrinkRequest) => Promise<void>;
  stop: () => Promise<void>;
} | null>(null);
export function useDrinkSession() {
  const value = useContext(DrinkSessionContext);
  if (!value) throw new Error("DrinkSessionProvider is missing");
  return value;
}
