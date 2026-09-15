import { Square } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDrinkSession } from "../state/useDrinkSession";
export function ActiveDrinkBar() {
  const { session, status, stop, stopping } = useDrinkSession();
  const navigate = useNavigate();
  const location = useLocation();
  if (
    !session ||
    (status?.state !== "running" && status?.state !== "paused") ||
    location.pathname === "/progress"
  )
    return null;
  return (
    <aside className="active-drink-bar" aria-label="Current drink">
      <button
        className="active-drink-open"
        onClick={() => navigate("/progress")}
        type="button"
      >
        <span
          className={
            status.state === "paused" ? "status-dot paused" : "status-dot"
          }
        />
        <span>
          <strong>{session.cocktail.name}</strong>
          <small>
            {status.state === "paused"
              ? "Paused · glass removed"
              : `Making your drink · ${status.progress}%`}
          </small>
        </span>
      </button>
      <button
        className="stop-button"
        disabled={stopping}
        onClick={() => void stop()}
        type="button"
      >
        <Square size={18} />
        {stopping ? "Stopping…" : "Stop"}
      </button>
    </aside>
  );
}
