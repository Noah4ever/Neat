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
  resumeOperation,
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
  const [resuming, setResuming] = useState(false);
  const lock = useRef(false);
  const completedRecipe = useRef<number | null>(null);
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
    if (
      !session ||
      status?.kind !== "drink" ||
      status.recipeId !== session.cocktail.id ||
      (status.state !== "finished" && status.state !== "stopped") ||
      completedRecipe.current === session.cocktail.id
    )
      return;
    completedRecipe.current = session.cocktail.id;
    lock.current = false;
    void client.invalidateQueries({ queryKey: ["bottles"] });
    void client.invalidateQueries({ queryKey: ["recipes"] });
    if (status.state === "stopped") {
      queueMicrotask(() => setSession(null));
      if (location.pathname === "/progress") navigate("/", { replace: true });
      return;
    }
    const after = session.cocktail.preparationSteps.filter(
      (step) => step.phase === "AFTER",
    );
    toast.success(`${session.cocktail.name} is ready`, {
      description: after.length
        ? after.map((step) => step.text).join(" · ")
        : undefined,
      duration: 3500,
    });
    if (location.pathname !== "/progress") {
      queueMicrotask(() => setSession(null));
      return;
    }
    window.setTimeout(
      () => {
        setSession((current) =>
          current?.cocktail.id === session.cocktail.id ? null : current,
        );
        navigate("/", { replace: true });
      },
      after.length ? 8000 : 2500,
    );
  }, [session, status, client, location.pathname, navigate]);

  async function start(cocktail: Cocktail, request: MakeDrinkRequest) {
    if (
      lock.current ||
      status?.state === "running" ||
      status?.state === "paused"
    )
      throw new ApiError(409, "machine_busy");
    lock.current = true;
    completedRecipe.current = null;
    setStarting(true);
    try {
      await makeDrink(request);
      client.setQueryData(["status"], {
        state: "running",
        kind: "drink",
        recipeId: cocktail.id,
        label: cocktail.name,
        progress: 0,
        glassPresent: true,
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
  async function resume(ignoreGlass = false) {
    setResuming(true);
    try {
      await resumeOperation(ignoreGlass);
      await client.invalidateQueries({ queryKey: ["status"] });
    } catch (error) {
      showApiError(error);
    } finally {
      setResuming(false);
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
          status.state === "paused" ||
          (status.kind === "calibration" && status.state === "finished"),
        stopping,
        resuming,
        start,
        stop,
        resume,
      }}
    >
      {children}
    </DrinkSessionContext.Provider>
  );
}
