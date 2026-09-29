import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ActiveDrinkBar } from "./components/ActiveDrinkBar";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { CloudHeartbeat } from "./components/CloudHeartbeat";
import { Header } from "./components/Header";
import { SettingsLayout } from "./components/SettingsLayout";
import { DeveloperPage } from "./pages/DeveloperPage";
import { EditRecipePage } from "./pages/EditRecipePage";
import { GeneralSettingsPage } from "./pages/GeneralSettingsPage";
import { IngredientsPage } from "./pages/IngredientsPage";
import { MainCocktailPage } from "./pages/MainCocktailPage";
import { NetworkSettingsPage } from "./pages/NetworkSettingsPage";
import { PrepareCocktailPage } from "./pages/PrepareCocktailPage";
import { ProgressPage } from "./pages/ProgressPage";
import { PumpsPage } from "./pages/PumpsPage";
import { QueuePage } from "./pages/QueuePage";
import { RecipesPage } from "./pages/RecipesPage";
import { SystemOverviewPage } from "./pages/SystemOverviewPage";
import { DeveloperModeProvider } from "./state/DeveloperMode";
import { DrinkSessionProvider } from "./state/DrinkSession";

export function MachineApplication() {
  const [search, setSearch] = useState("");
  useEffect(() => {
    const splash = document.getElementById("pwa-splash");
    const timer = window.setTimeout(() => {
      splash?.classList.add("pwa-splash--hidden");
      window.setTimeout(() => splash?.remove(), 250);
    }, 650);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <DeveloperModeProvider>
      <DrinkSessionProvider>
        <div className="application-frame">
          <CloudHeartbeat />
          <ConnectionBanner />
          <Header search={search} onSearchChange={setSearch} />
          <div className="route-frame">
            <Routes>
              <Route
                element={<MainCocktailPage search={search} />}
                path="/"
              />
              <Route
                element={<PrepareCocktailPage />}
                path="/prepare/:id"
              />
              <Route element={<ProgressPage />} path="/progress" />
              <Route element={<QueuePage />} path="/queue" />
              <Route element={<SettingsLayout />} path="/settings">
                <Route index element={<GeneralSettingsPage />} />
                <Route element={<RecipesPage />} path="recipes" />
                <Route element={<EditRecipePage />} path="recipes/:id" />
                <Route element={<IngredientsPage />} path="ingredients" />
                <Route element={<PumpsPage />} path="pumps" />
                <Route
                  element={<Navigate replace to="/settings/pumps" />}
                  path="cleaning"
                />
                <Route
                  element={<Navigate replace to="/settings/pumps" />}
                  path="calibration"
                />
                <Route element={<NetworkSettingsPage />} path="network" />
                <Route element={<SystemOverviewPage />} path="system" />
                <Route element={<DeveloperPage />} path="developer" />
                <Route
                  element={<Navigate replace to="/settings" />}
                  path="display"
                />
                <Route
                  element={<GeneralSettingsPage page="about" />}
                  path="about"
                />
              </Route>
              <Route element={<Navigate replace to="/" />} path="*" />
            </Routes>
          </div>
          <ActiveDrinkBar />
        </div>
      </DrinkSessionProvider>
    </DeveloperModeProvider>
  );
}
