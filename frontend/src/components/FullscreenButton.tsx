import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize, X } from "lucide-react";
export function FullscreenButton() {
  const [active, setActive] = useState(!!document.fullscreenElement);
  const [message, setMessage] = useState("");
  const control = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const change = () => setActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  useEffect(() => {
    if (!message) return;
    const dismiss = (event: PointerEvent) => { if (!control.current?.contains(event.target as Node)) setMessage(""); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [message]);
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
    <div className="fullscreen-control" ref={control}>
      <button
        className="icon-button"
        aria-label={active ? "Exit full screen" : "Enter full screen"}
        title={active ? "Exit full screen" : "Enter full screen"}
        onClick={toggle}
        type="button"
      >
        {active ? <Minimize /> : <Maximize />}
      </button>
      {message && <div className="fullscreen-hint" role="status"><span>{message}</span><button aria-label="Dismiss full screen hint" onClick={() => setMessage("")} type="button"><X size={16} /></button></div>}
    </div>
  );
}
