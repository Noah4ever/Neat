import { useState } from "react";
import { Header } from "./components/Header";
import { PumpsPage } from "./pages/PumpsPage";
import { Toaster } from "sonner";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { SettingsLayout } from "./components/SettingsLayout";
import { EditRecipePage } from "./pages/EditRecipePage";
import { GeneralSettingsPage } from "./pages/GeneralSettingsPage";
import { IngredientsPage } from "./pages/IngredientsPage";
import { MainCocktailPage } from "./pages/MainCocktailPage";
import { NetworkSettingsPage } from "./pages/NetworkSettingsPage";
import { PrepareCocktailPage } from "./pages/PrepareCocktailPage";
import { ProgressPage } from "./pages/ProgressPage";
import { RecipesPage } from "./pages/RecipesPage";
import { DrinkSessionProvider } from "./state/DrinkSession";
import { DeveloperModeProvider } from "./state/DeveloperMode";
import { DeveloperPage } from "./pages/DeveloperPage";
import { SystemOverviewPage } from "./pages/SystemOverviewPage";
import { ActiveDrinkBar } from "./components/ActiveDrinkBar";
import "./App.css";
import { ConnectionBanner } from "./components/ConnectionBanner";

function App() {
  const [search, setSearch] = useState("");
  return (
    <>
      <HashRouter>
        <DeveloperModeProvider>
          <DrinkSessionProvider>
            <div className="application-frame">
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
      </HashRouter>
      <Toaster
        closeButton
        position="bottom-center"
        swipeDirections={["left", "right"]}
        theme="dark"
        toastOptions={{
          closeButtonAriaLabel: "Dismiss notification",
          classNames: {
            toast: "neat-toast",
            title: "neat-toast__title",
            description: "neat-toast__description",
            actionButton: "neat-toast__action",
            closeButton: "neat-toast__close",
            error: "neat-toast--error",
            warning: "neat-toast--warning",
            success: "neat-toast--success",
          },
        }}
      />
    </>
  );
}

export default App;
