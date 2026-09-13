import { ChevronLeft, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Brand } from "./Brand";
import { SearchBar } from "./SearchBar";
export function Header({
  search,
  onSearchChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const home = location.pathname === "/";
  return (
    <header className="app-header">
      <Brand />
      <div className="header-center">
        {home ? (
          <SearchBar value={search} onChange={onSearchChange} />
        ) : (
          <button
            className="back-button"
            type="button"
            onClick={() => navigate("/")}
          >
            <ChevronLeft size={22} />
            Drinks
          </button>
        )}
      </div>
      <button
        className="icon-button admin-entry"
        aria-label="Admin settings"
        type="button"
        onClick={() => navigate("/settings")}
      >
        <Settings size={20} />
      </button>
    </header>
  );
}
