import {
  Beaker,
  CircleHelp,
  Droplets,
  Gauge,
  House,
  Martini,
  Monitor,
  SlidersHorizontal,
  Wifi,
} from "lucide-react";
import { NavLink } from "react-router-dom";

const navigation = [
  { to: "/settings", label: "General", icon: House, end: true },
  { to: "/settings/recipes", label: "Recipes", icon: Martini },
  { to: "/settings/ingredients", label: "Ingredients", icon: Beaker },
  { to: "/settings/pumps", label: "Pumps", icon: Gauge },
  { to: "/settings/cleaning", label: "Cleaning", icon: Droplets },
  {
    to: "/settings/calibration",
    label: "Calibration",
    icon: SlidersHorizontal,
  },
  { to: "/settings/network", label: "Network", icon: Wifi },
  { to: "/settings/display", label: "Display", icon: Monitor },
  { to: "/settings/about", label: "About", icon: CircleHelp },
];

export function SettingsSidebar() {
  return (
    <aside className="settings-sidebar">
      <nav aria-label="Settings navigation">
        {navigation.map(({ to, label, icon: Icon, end }) => (
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
