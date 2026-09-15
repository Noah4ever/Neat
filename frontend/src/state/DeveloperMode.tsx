import { useState } from "react";
import type { ReactNode } from "react";
import { DeveloperModeContext } from "./developerModeContext";
const key = "neat.developerMode";
export function DeveloperModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(
    () => sessionStorage.getItem(key) === "true",
  );
  const enable = () => {
    sessionStorage.setItem(key, "true");
    setEnabled(true);
  };
  const disable = () => {
    sessionStorage.removeItem(key);
    setEnabled(false);
  };
  return (
    <DeveloperModeContext.Provider value={{ enabled, enable, disable }}>
      {children}
    </DeveloperModeContext.Provider>
  );
}
