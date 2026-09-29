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
import { tr } from "../services/language";

const navigation = [
  { to: "/settings", label: "General", icon: House, end: true },
  { to: "/settings/recipes", label: "Recipes", icon: Martini },
  { to: "/settings/ingredients", label: "Ingredients", icon: Beaker },
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
  const labels: Record<string, string> = { General: tr("General", "Allgemein"), Recipes: tr("Recipes", "Rezepte"), Ingredients: tr("Ingredients", "Zutaten"), Pumps: tr("Pumps", "Pumpen"), Network: tr("Network", "Netzwerk"), System: "System", About: tr("About", "Info"), Developer: "Developer" };
  return (
    <aside className="settings-sidebar">
      <nav aria-label="Settings navigation">
        {visibleNavigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink end={end} key={to} to={to}>
            <Icon size={18} />
            <span>{labels[label] ?? label}</span>
          </NavLink>
        ))}
      </nav>
      <span className="settings-sidebar__version">Neat v1.0.0</span>
    </aside>
  );
}
