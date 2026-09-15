import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BellRing,
  CircleStop,
  GlassWater,
  Lightbulb,
  Plus,
  Radio,
  Settings2,
  TestTube2,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../components/Modal";
import { PageHeading } from "../components/SettingsPrimitives";
import { QueryMessage } from "../components/QueryMessage";
import {
  getDeveloperStatus,
  deletePump,
  resetDeveloperLeds,
  savePump,
  setDeveloperLed,
  stopAllDeveloperPumps,
  stopDeveloperBuzzer,
  stopDeveloperPump,
  testDeveloperBuzzer,
  testDeveloperPump,
} from "../services/api";
import { ApiError } from "../services/errors";
import {
  showApiError,
  showApiErrorWithRetry,
  showMachineEvent,
} from "../services/notifications";
import { createMachineWebSocket } from "../services/websocket";
import { useDeveloperMode } from "../state/developerModeContext";
import type { PumpConfig } from "../types/device";

export function DeveloperPage() {
  const { disable } = useDeveloperMode();
  const cache = useQueryClient();
  const [events, setEvents] = useState<string[]>([]);
  const [leds, setLeds] = useState<Record<number, boolean>>({});
  const [editingPump, setEditingPump] = useState<PumpConfig | null>(null);
  const [newPump, setNewPump] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = useQuery({
    queryKey: ["developer-status"],
    queryFn: getDeveloperStatus,
    refetchInterval: 300,
  });
  const action = useMutation({
    mutationFn: async (fn: () => Promise<void>) => fn(),
    onSuccess: () =>
      void cache.invalidateQueries({ queryKey: ["developer-status"] }),
    onError: showApiError,
  });
  const pumpMutation = useMutation({
    mutationFn: async (remove: boolean) => {
      if (!editingPump) return;
      if (remove) await deletePump(editingPump.id);
      else await savePump(editingPump, newPump);
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["developer-status"] });
      void cache.invalidateQueries({ queryKey: ["pumps"] });
      setEditingPump(null);
      setConfirmDelete(false);
      toast.success("Pump hardware updated");
    },
    onError: showApiError,
  });
  useEffect(
    () =>
      createMachineWebSocket((event) =>
        setEvents((values) =>
          [
            `${new Date().toLocaleTimeString()}  ${event.type}`,
            ...values,
          ].slice(0, 8),
        ),
      ),
    [],
  );
  useEffect(
    () => () => {
      void resetDeveloperLeds();
      void stopDeveloperBuzzer();
    },
    [],
  );
  if (!status.data)
    return (
      <div className="settings-page">
        <PageHeading title="Developer" subtitle="Hardware diagnostics." />
        <QueryMessage query={status} />
      </div>
    );
  const data = status.data;
  return (
    <div className="settings-page developer-page">
      <PageHeading
        title="Developer"
        subtitle="Live hardware diagnostics. Tests use real outputs."
        action={
          <button
            className="secondary-button"
            onClick={() => {
              void resetDeveloperLeds();
              disable();
              toast.success("Developer settings hidden");
            }}
          >
            Disable developer mode
          </button>
        }
      />
      <div className="developer-status-grid">
        <article data-active={data.glassPresent}>
          <GlassWater />
          <span>
            <small>Glass sensor</small>
            <strong>{data.glassPresent ? "Glass present" : "No glass"}</strong>
          </span>
        </article>
        <article data-active={data.machine.busy}>
          <Activity />
          <span>
            <small>Machine</small>
            <strong>
              {data.machine.kind} · {data.machine.state}
            </strong>
          </span>
        </article>
        <article data-active>
          <Radio />
          <span>
            <small>WebSocket</small>
            <strong>Listening</strong>
          </span>
        </article>
      </div>
      <section className="settings-card">
        <div className="section-heading">
          <div>
            <h2>Pump hardware</h2>
            <p className="muted">
              IDs and GPIO pins are installation settings.
            </p>
          </div>
          <button
            className="secondary-button"
            disabled={data.machine.busy}
            onClick={() => {
              setNewPump(true);
              setConfirmDelete(false);
              setEditingPump({
                id: Math.max(0, ...data.pumps.map((pump) => pump.id)) + 1,
                ingredientId: null,
                mlPerSec: null,
                output: { type: 0, channel: 0 },
              });
            }}
            type="button"
          >
            <Plus size={18} /> Add pump
          </button>
        </div>
        <div className="developer-pump-list">
          {data.pumps.map((pump) => (
            <article key={pump.id}>
              <span>
                <strong>Pump {pump.id}</strong>
                <small>
                  GPIO {pump.output.channel} · {pump.mlPerSec ? "Calibrated" : "Not calibrated"}
                </small>
              </span>
              <button
                className="secondary-button"
                disabled={data.machine.busy}
                onClick={() => {
                  setNewPump(false);
                  setConfirmDelete(false);
                  setEditingPump(structuredClone(pump));
                }}
                type="button"
              >
                <Settings2 size={18} /> Configure
              </button>
            </article>
          ))}
        </div>
      </section>
      <section className="settings-card">
        <div className="section-heading">
          <div>
            <h2>Pump tests</h2>
            <p className="muted">
              Every test stops automatically after one second. Server limit:
              five seconds.
            </p>
          </div>
          <button
            className="stop-button"
            onClick={() => action.mutate(stopAllDeveloperPumps)}
          >
            <CircleStop size={18} /> Stop all
          </button>
        </div>
        <div className="developer-pump-list">
          {data.pumps.map((pump) => (
            <article key={pump.id}>
              <span>
                <strong>Pump {pump.id}</strong>
                <small>
                  GPIO {pump.output.channel} ·{" "}
                  {pump.running ? "Running" : "Stopped"}
                </small>
              </span>
              <div>
                <button
                  className="secondary-button"
                  disabled={data.machine.busy && !pump.running}
                  onPointerDown={() =>
                    action.mutate(() => testDeveloperPump(pump.id, 1000))
                  }
                  onPointerUp={() =>
                    action.mutate(() => stopDeveloperPump(pump.id))
                  }
                  onPointerCancel={() =>
                    action.mutate(() => stopDeveloperPump(pump.id))
                  }
                >
                  <TestTube2 size={18} /> Hold to test
                </button>
                <button
                  className="stop-button"
                  onClick={() =>
                    action.mutate(() => stopDeveloperPump(pump.id))
                  }
                >
                  Stop
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <Modal
        open={!!editingPump}
        onOpenChange={(open) => {
          if (!open && !pumpMutation.isPending) setEditingPump(null);
        }}
        title={
          confirmDelete
            ? "Delete pump?"
            : newPump
              ? "Add pump hardware"
              : `Configure pump ${editingPump?.id ?? ""}`
        }
        description="Changes here directly control a physical ESP32 output."
      >
        {editingPump &&
          (confirmDelete ? (
            <div className="button-row">
              <button
                className="secondary-button"
                onClick={() => setConfirmDelete(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={pumpMutation.isPending}
                onClick={() => pumpMutation.mutate(true)}
                type="button"
              >
                Delete pump
              </button>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                pumpMutation.mutate(false);
              }}
            >
              <div className="form-fields">
                <label>
                  Pump ID
                  <input
                    type="number"
                    min={0}
                    max={255}
                    required
                    disabled={!newPump}
                    value={editingPump.id}
                    onChange={(event) =>
                      setEditingPump({
                        ...editingPump,
                        id: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  GPIO pin
                  <input
                    type="number"
                    min={0}
                    max={30}
                    required
                    value={editingPump.output.channel}
                    onChange={(event) =>
                      setEditingPump({
                        ...editingPump,
                        output: {
                          type: 0,
                          channel: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
              </div>
              <div className="button-row">
                {!newPump && (
                  <button
                    className="danger-button"
                    onClick={() => setConfirmDelete(true)}
                    type="button"
                  >
                    Delete
                  </button>
                )}
                <button
                  className="primary-button"
                  disabled={pumpMutation.isPending}
                >
                  Save hardware
                </button>
              </div>
            </form>
          ))}
      </Modal>
      <section className="settings-card">
        <div className="section-heading">
          <div>
            <h2>Bottle LEDs</h2>
            <p className="muted">
              Temporary test state; cleared when you leave.
            </p>
          </div>
          <Lightbulb />
        </div>
        <div className="developer-button-grid">
          {data.pumps.map((pump) => (
            <button
              className={
                leds[pump.id]
                  ? "secondary-button is-active"
                  : "secondary-button"
              }
              key={pump.id}
              onClick={() => {
                const next = !leds[pump.id];
                setLeds({ ...leds, [pump.id]: next });
                action.mutate(() => setDeveloperLed(pump.id, next));
              }}
            >
              Pump {pump.id} · {leds[pump.id] ? "On" : "Off"}
            </button>
          ))}
          <button
            className="secondary-button"
            onClick={() => {
              setLeds({});
              action.mutate(resetDeveloperLeds);
            }}
          >
            Reset LEDs
          </button>
        </div>
      </section>
      <section className="settings-card">
        <div className="section-heading">
          <div>
            <h2>Buzzer</h2>
            <p className="muted">Play a bounded built-in melody.</p>
          </div>
          <BellRing />
        </div>
        <div className="developer-button-grid">
          <button
            className="secondary-button"
            onClick={() => action.mutate(() => testDeveloperBuzzer("success"))}
          >
            Success
          </button>
          <button
            className="secondary-button"
            onClick={() => action.mutate(() => testDeveloperBuzzer("error"))}
          >
            Error
          </button>
          <button
            className="stop-button"
            onClick={() => action.mutate(stopDeveloperBuzzer)}
          >
            Stop
          </button>
        </div>
      </section>
      <section className="settings-card">
        <h2>Notification previews</h2>
        <div className="developer-button-grid">
          <button
            className="secondary-button"
            onClick={() =>
              showApiErrorWithRetry(new ApiError(409, "no_glass"), () =>
                toast("Retry preview"),
              )
            }
          >
            No glass
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              showMachineEvent({
                type: "machine_error",
                error: "glass_removed",
              })
            }
          >
            Glass removed
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              showMachineEvent({
                type: "machine_warning",
                warning: "bottle_may_be_empty",
                pumpId: 1,
              })
            }
          >
            Bottle warning
          </button>
        </div>
      </section>
      <section className="settings-card">
        <h2>Recent WebSocket events</h2>
        <div className="event-log">
          {events.length ? (
            events.map((event, index) => (
              <code key={`${event}-${index}`}>{event}</code>
            ))
          ) : (
            <p className="muted">Waiting for events…</p>
          )}
        </div>
      </section>
      <section className="settings-card">
        <h2>Bottle estimates</h2>
        <div className="developer-bottles">
          {data.bottles.map((bottle) => (
            <span key={bottle.pumpId}>
              <strong>Pump {bottle.pumpId}</strong>
              <small>
                {Math.round(bottle.remainingMl)} / {bottle.capacityMl} ml
              </small>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
