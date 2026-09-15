import { createContext, useContext } from "react";
export const DeveloperModeContext = createContext<{
  enabled: boolean;
  enable: () => void;
  disable: () => void;
} | null>(null);
export function useDeveloperMode() {
  const value = useContext(DeveloperModeContext);
  if (!value) throw new Error("DeveloperModeProvider is missing");
  return value;
}
