import {
  Beaker,
  CircleHelp,
  Gauge,
  House,
  Martini,
  Cpu,
  Wrench,
  Wifi,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useDeveloperMode } from "../state/developerModeContext";

const navigation = [
  { to: "/settings", label: "General", icon: House, end: true },
  { to: "/settings/ingredients", label: "Ingredients", icon: Beaker },
  { to: "/settings/recipes", label: "Recipes", icon: Martini },
  { to: "/settings/pumps", label: "Pumps", icon: Gauge },
  { to: "/settings/network", label: "Network", icon: Wifi },
  { to: "/settings/system", label: "System", icon: Cpu },
  { to: "/settings/about", label: "About", icon: CircleHelp },
];

export function SettingsSidebar() {
  const { enabled } = useDeveloperMode();
  const visibleNavigation = enabled
    ? [
        ...navigation,
        { to: "/settings/developer", label: "Developer", icon: Wrench },
      ]
    : navigation;
  return (
    <aside className="settings-sidebar">
      <nav aria-label="Settings navigation">
        {visibleNavigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink end={end} key={to} to={to}>
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <span className="settings-sidebar__version">Neat v1.0.0</span>
    </aside>
  );
}
