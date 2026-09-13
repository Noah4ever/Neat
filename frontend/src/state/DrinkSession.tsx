import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DrinkSessionContext } from "./useDrinkSession";
import type { DrinkSession } from "./useDrinkSession";
import {
  getStatus,
  makeDrink,
  stopOperation,
  USE_MOCK_API,
} from "../services/api";
import type { MakeDrinkRequest } from "../services/api";
import type { Cocktail } from "../types/cocktail";

export function DrinkSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DrinkSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const lock = useRef(false);
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: getStatus,
    refetchInterval: USE_MOCK_API ? 500 : 1000,
  });

  useEffect(() => {
    if (!session) return;
    let completed = false;
    return client.getQueryCache().subscribe((event) => {
      if (completed || event.query.queryKey[0] !== "status") return;
      const current = client.getQueryData<
        import("../types/device").OperationStatus
      >(["status"]);
      if (
        current?.kind !== "drink" ||
        current.recipeId !== session.cocktail.id ||
        (current.state !== "finished" && current.state !== "stopped")
      )
        return;
      completed = true;
      setSession(null);
      lock.current = false;
      if (location.pathname === "/progress") navigate("/", { replace: true });
      if (current.state === "finished")
        toast.success(`${session.cocktail.name} is ready`, { duration: 2500 });
    });
  }, [session, client, location.pathname, navigate]);

  async function start(cocktail: Cocktail, request: MakeDrinkRequest) {
    if (lock.current || status?.state === "running")
      throw new Error("The machine is busy. You can keep browsing.");
    lock.current = true;
    setStarting(true);
    try {
      await makeDrink(request);
      client.setQueryData(["status"], {
        state: "running",
        kind: "drink",
        recipeId: cocktail.id,
        label: cocktail.name,
        progress: 0,
      });
      setSession({ cocktail });
    } catch (error) {
      lock.current = false;
      throw error;
    } finally {
      setStarting(false);
    }
  }
  async function stop() {
    setStopping(true);
    try {
      await stopOperation();
      await client.invalidateQueries({ queryKey: ["status"] });
      setSession(null);
      lock.current = false;
      if (location.pathname === "/progress") navigate("/", { replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not stop the operation.",
      );
    } finally {
      setStopping(false);
    }
  }
  return (
    <DrinkSessionContext.Provider
      value={{
        session,
        status,
        busy:
          starting ||
          stopping ||
          !status ||
          status.state === "running" ||
          (status.kind === "calibration" && status.state === "finished"),
        stopping,
        start,
        stop,
      }}
    >
      {children}
    </DrinkSessionContext.Provider>
  );
}
