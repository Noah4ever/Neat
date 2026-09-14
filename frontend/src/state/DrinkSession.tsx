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
} from "../services/api";
import type { MakeDrinkRequest } from "../services/api";
import type { Cocktail } from "../types/cocktail";
import { ApiError } from "../services/errors";
import { showApiError, showMachineEvent } from "../services/notifications";
import { createMachineWebSocket } from "../services/websocket";

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
    refetchInterval: 1000,
  });

  useEffect(
    () =>
      createMachineWebSocket((event) => {
        if (event.type === "machine_error" || event.type === "machine_warning")
          showMachineEvent(event);
        if (event.type === "machine_error")
          void client.invalidateQueries({ queryKey: ["status"] });
        if (event.type === "machine_warning")
          void client.invalidateQueries({ queryKey: ["bottles"] });
      }),
    [client],
  );

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
      throw new ApiError(409, "machine_busy");
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
      showApiError(error);
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
