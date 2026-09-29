import { useEffect } from "react";
import { sendCloudHeartbeat } from "../services/cloud";
import { getRecipes } from "../services/api";

export function CloudHeartbeat() {
  useEffect(() => {
    const send = () => void getRecipes().then((recipes) => sendCloudHeartbeat(recipes.map((recipe) => recipe.imageKey).filter((value): value is string => Boolean(value)))).catch(() => undefined);
    send();
    const interval = window.setInterval(send, 20_000);
    return () => window.clearInterval(interval);
  }, []);
  return null;
}
