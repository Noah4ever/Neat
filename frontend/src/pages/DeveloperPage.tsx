import { useEffect, useRef, useState } from "react";
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
import { CloudIntegrationCard } from "../components/CloudIntegrationCard";
import { PageHeading } from "../components/SettingsPrimitives";
import { QueryMessage } from "../components/QueryMessage";
import {
  getDeveloperStatus,
  getDeviceSettings,
  setMockApiEnabled,
  deletePump,
  resetDeveloperLeds,
  savePump,
  setDeveloperLed,
  stopAllDeveloperPumps,
  stopDeveloperBuzzer,
  stopDeveloperPump,
  testDeveloperBuzzer,
  testDeveloperPump,
  updateDeviceSettings,
  USE_MOCK_API,
} from "../services/api";
import { ApiError } from "../services/errors";
import {
  showApiError,
  showApiErrorWithRetry,
  showMachineEvent,
} from "../services/notifications";
import { createMachineWebSocket } from "../services/websocket";
import { useDeveloperMode } from "../state/developerModeContext";
import type { BuzzerTone, PumpConfig } from "../types/device";

function BuzzerComposer() {
  const cache = useQueryClient();
  const settings = useQuery({ queryKey: ["device-settings"], queryFn: getDeviceSettings });
  const [kind, setKind] = useState<"success" | "error">("success");
  const [draft, setDraft] = useState<BuzzerTone[] | null>(null);
  const tones = draft ?? (kind === "success" ? settings.data?.successSound : settings.data?.errorSound) ?? [];
  const save = useMutation({
    mutationFn: async () => {
      if (!settings.data) return;
      await updateDeviceSettings({ ...settings.data, [kind === "success" ? "successSound" : "errorSound"]: tones });
    },
    onSuccess: async () => { setDraft(null); await cache.invalidateQueries({ queryKey: ["device-settings"] }); toast.success("Buzzer sound saved to Neat"); },
    onError: showApiError,
  });
  const update = (index: number, patch: Partial<BuzzerTone>) => setDraft(tones.map((tone, valueIndex) => valueIndex === index ? { ...tone, ...patch } : tone));
  return <section className="settings-card buzzer-composer"><div className="section-heading"><div><h2>Buzzer composer</h2><p className="muted">Shape the tones Neat plays and save them on the machine.</p></div><BellRing /></div><div className="buzzer-kind"><button className={kind === "success" ? "active" : ""} onClick={() => { setKind("success"); setDraft(null); }} type="button">Success</button><button className={kind === "error" ? "active" : ""} onClick={() => { setKind("error"); setDraft(null); }} type="button">Error</button></div><div className="tone-timeline" aria-label="Tone timeline">{tones.map((tone, index) => <div className="tone-block" key={index} style={{ height: `${34 + tone.frequencyHz / 70}px`, flexGrow: tone.durationMs }}><span>{tone.frequencyHz} Hz</span><small>{tone.durationMs} ms</small></div>)}</div><div className="tone-controls">{tones.map((tone, index) => <article key={index}><strong>Tone {index + 1}</strong><label>Pitch<input min="100" max="3000" step="10" type="range" value={tone.frequencyHz} onChange={(event) => update(index, { frequencyHz: Number(event.target.value) })} /></label><label>Duration<input inputMode="numeric" min="20" max="2000" type="number" value={tone.durationMs} onChange={(event) => update(index, { durationMs: Math.max(20, Number(event.target.value)) })} /></label><button disabled={tones.length === 1} onClick={() => setDraft(tones.filter((_, valueIndex) => valueIndex !== index))} type="button">Remove</button></article>)}</div><div className="button-row"><button className="secondary-button" disabled={tones.length >= 12} onClick={() => setDraft([...tones, { frequencyHz: 1000, durationMs: 120 }])} type="button"><Plus size={18} /> Add tone</button><button className="secondary-button" onClick={() => testDeveloperBuzzer(kind)} type="button">Preview saved sound</button><button className="primary-button" disabled={!draft || save.isPending} onClick={() => save.mutate()} type="button">{save.isPending ? "Saving…" : "Save sound"}</button></div></section>;
}

function ApiModeCard() {
  return (
    <section className="settings-card developer-api-mode">
      <div className="settings-row">
        <span className="settings-row__copy">
          <strong>Mock API</strong>
          <small>
            {USE_MOCK_API
              ? "Simulated data is active. Hardware outputs are not used."
              : "Real ESP REST and WebSocket connections are active."}
          </small>
        </span>
        <button
          type="button"
          className="toggle-control"
          role="switch"
          aria-label="Mock API"
          aria-checked={USE_MOCK_API}
          onClick={() => setMockApiEnabled(!USE_MOCK_API)}
        >
          <span />
        </button>
      </div>
    </section>
  );
}

export function DeveloperPage() {
  const { disable } = useDeveloperMode();
  const cache = useQueryClient();
  const [events, setEvents] = useState<string[]>([]);
  const [leds, setLeds] = useState<Record<number, boolean>>({});
  const [editingPump, setEditingPump] = useState<PumpConfig | null>(null);
  const [newPump, setNewPump] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testingAll, setTestingAll] = useState(false);
  const cancelPumpSequence = useRef(false);
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
  async function testAllPumps() {
    if (!status.data || testingAll) return;
    cancelPumpSequence.current = false;
    setTestingAll(true);
    try {
      for (const pump of status.data.pumps) {
        if (cancelPumpSequence.current) break;
        await testDeveloperPump(pump.id, 500);
        await new Promise((resolve) => window.setTimeout(resolve, 600));
      }
    } catch (error) {
      showApiError(error);
      await stopAllDeveloperPumps().catch(() => undefined);
    } finally {
      setTestingAll(false);
      void cache.invalidateQueries({ queryKey: ["developer-status"] });
    }
  }
  useEffect(
    () => () => {
      void Promise.allSettled([resetDeveloperLeds(), stopDeveloperBuzzer()]);
    },
    [],
  );
  if (!status.data)
    return (
      <div className="settings-page">
        <PageHeading title="Developer" subtitle="Hardware diagnostics." />
        <ApiModeCard />
        <CloudIntegrationCard />
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
              void resetDeveloperLeds().catch(() => undefined);
              disable();
              toast.success("Developer settings hidden");
            }}
          >
            Disable developer mode
          </button>
        }
      />
      <ApiModeCard />
      <CloudIntegrationCard />
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
      <BuzzerComposer />
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
          <div className="button-row">
            <button className="secondary-button" disabled={testingAll || data.machine.busy} onClick={() => void testAllPumps()} type="button"><TestTube2 size={18} /> {testingAll ? "Testing…" : "Test all"}</button>
            <button className="stop-button" onClick={() => { cancelPumpSequence.current = true; action.mutate(stopAllDeveloperPumps); }} type="button"><CircleStop size={18} /> Stop all</button>
          </div>
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
