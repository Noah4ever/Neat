import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MachineRoot from "./MachineRoot";
import "./index.css";
import "./App.css";

const viewport = window.visualViewport;
let stableHeight = window.innerHeight;
const syncViewport = () => {
  const next = viewport?.height ?? window.innerHeight;
  if (next > window.screen.height * 0.68) stableHeight = next;
  document.documentElement.style.setProperty("--app-height", `${stableHeight}px`);
};
syncViewport();
viewport?.addEventListener("resize", syncViewport);
window.addEventListener("orientationchange", () => window.setTimeout(syncViewport, 150));

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MachineRoot />
    </QueryClientProvider>
  </StrictMode>,
);
