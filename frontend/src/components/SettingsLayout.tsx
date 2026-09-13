import { Outlet, useLocation } from "react-router-dom";
import { SettingsSidebar } from "./SettingsSidebar";
export function SettingsLayout() {
  const location = useLocation();
  return (
    <div className="settings-shell">
      <SettingsSidebar />
      <main className="settings-main" key={location.pathname}>
        <Outlet />
      </main>
    </div>
  );
}
