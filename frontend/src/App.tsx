import { useState } from "react";
import { Header } from "./components/Header";
import { PumpsPage } from "./pages/PumpsPage";
import { CalibrationPage } from "./pages/CalibrationPage";
import { Toaster } from "sonner";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { SettingsLayout } from "./components/SettingsLayout";
import { CleaningSettingsPage } from "./pages/CleaningSettingsPage";
import { EditRecipePage } from "./pages/EditRecipePage";
import { GeneralSettingsPage } from "./pages/GeneralSettingsPage";
import { IngredientsPage } from "./pages/IngredientsPage";
import { MainCocktailPage } from "./pages/MainCocktailPage";
import { NetworkSettingsPage } from "./pages/NetworkSettingsPage";
import { PrepareCocktailPage } from "./pages/PrepareCocktailPage";
import { ProgressPage } from "./pages/ProgressPage";
import { RecipesPage } from "./pages/RecipesPage";
import { DrinkSessionProvider } from "./state/DrinkSession";
import { ActiveDrinkBar } from "./components/ActiveDrinkBar";
import "./App.css";

function App() {
  const [search, setSearch] = useState("");
  return (
    <>
      <HashRouter>
        <DrinkSessionProvider>
          <div className="application-frame">
            <Header search={search} onSearchChange={setSearch} />
            <div className="route-frame">
              <Routes>
                <Route
                  element={<MainCocktailPage search={search} />}
                  path="/"
                />
                <Route element={<PrepareCocktailPage />} path="/prepare/:id" />
                <Route element={<ProgressPage />} path="/progress" />
                <Route element={<SettingsLayout />} path="/settings">
                  <Route index element={<GeneralSettingsPage />} />
                  <Route element={<RecipesPage />} path="recipes" />
                  <Route element={<EditRecipePage />} path="recipes/:id" />
                  <Route element={<IngredientsPage />} path="ingredients" />
                  <Route element={<PumpsPage />} path="pumps" />
                  <Route element={<CleaningSettingsPage />} path="cleaning" />
                  <Route element={<CalibrationPage />} path="calibration" />
                  <Route element={<NetworkSettingsPage />} path="network" />
                  <Route
                    element={<GeneralSettingsPage page="display" />}
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
      </HashRouter>
      <Toaster position="bottom-center" richColors theme="dark" />
    </>
  );
}

export default App;
