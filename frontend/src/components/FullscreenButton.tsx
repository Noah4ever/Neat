import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
export function FullscreenButton() {
  const [active, setActive] = useState(!!document.fullscreenElement);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const change = () => setActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.fullscreenEnabled)
        await document.documentElement.requestFullscreen();
      else {
        setMessage(
          "In Safari, tap Share → Add to Home Screen, then open Neat from its icon.",
        );
        return;
      }
      setMessage("");
    } catch {
      setMessage(
        "Fullscreen is unavailable here. Open Neat from its Home Screen icon instead.",
      );
    }
  }
  return (
    <div className="fullscreen-control">
      <button className="secondary-button" onClick={toggle} type="button">
        {active ? <Minimize /> : <Maximize />}
        {active ? "Exit full screen" : "Enter full screen"}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
