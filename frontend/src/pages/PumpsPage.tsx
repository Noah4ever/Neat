import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Droplets,
  Gauge,
  RefreshCcw,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../components/Modal";
import { PageHeading } from "../components/SettingsPrimitives";
import { ProgressMeter } from "../components/ProgressMeter";
import { QueryMessage } from "../components/QueryMessage";
import { SearchBar } from "../components/SearchBar";
import {
  assignPump,
  finishCalibration,
  getBottles,
  getIngredients,
  getPumps,
  startCalibration,
  startCleaning,
  updateBottle,
} from "../services/api";
import { showApiError } from "../services/notifications";
import { useDrinkSession } from "../state/useDrinkSession";
import type { BottleState, PumpConfig } from "../types/device";

type PumpArea = "bottles" | "cleaning" | "calibration";

export function PumpsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pumps = useQuery({ queryKey: ["pumps"], queryFn: getPumps });
  const ingredients = useQuery({
    queryKey: ["ingredients"],
    queryFn: getIngredients,
  });
  const bottles = useQuery({ queryKey: ["bottles"], queryFn: getBottles });
  const cache = useQueryClient();
  const { status, busy, stopping, stop } = useDrinkSession();
  const [area, setArea] = useState<PumpArea>(() => searchParams.get("area") === "calibration" ? "calibration" : "bottles");
  const [assigning, setAssigning] = useState<PumpConfig | null>(null);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const ingredientChoices = [...(ingredients.data ?? [])]
    .filter((ingredient) =>
      ingredient.name
        .toLocaleLowerCase()
        .includes(ingredientSearch.trim().toLocaleLowerCase()),
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  const [editingBottle, setEditingBottle] = useState<BottleState | null>(null);
  const [cleaningPump, setCleaningPump] = useState("all");
  const [calibrationPump, setCalibrationPump] = useState(() => searchParams.get("pump") ?? "");
  const [duration, setDuration] = useState(30);
  const [volume, setVolume] = useState("");
  const requestedIngredientId = Number(searchParams.get("assignIngredient")) || null;

  const refreshPumps = () => {
    void cache.invalidateQueries({ queryKey: ["pumps"] });
    void cache.invalidateQueries({ queryKey: ["recipes"] });
  };
  const assignment = useMutation({
    mutationFn: (value: { pumpId: number; ingredientId: number | null }) =>
      assignPump(value.pumpId, value.ingredientId),
    onSuccess: () => {
      refreshPumps();
      setAssigning(null);
      toast.success("Ingredient assigned");
    },
    onError: showApiError,
  });
  const bottleMutation = useMutation({
    mutationFn: (value: { bottle: BottleState; replaced: boolean }) =>
      updateBottle(value.bottle.pumpId, {
        capacityMl: value.bottle.capacityMl,
        remainingMl: value.replaced
          ? value.bottle.capacityMl
          : value.bottle.remainingMl,
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["bottles"] });
      setEditingBottle(null);
      toast.success("Bottle estimate updated");
    },
    onError: showApiError,
  });
  const cleaning = useMutation({
    mutationFn: () =>
      startCleaning(
        cleaningPump === "all" ? undefined : Number(cleaningPump),
      ),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["status"] }),
    onError: showApiError,
  });
  const calibration = useMutation({
    mutationFn: () =>
      startCalibration(Number(calibrationPump), duration * 1000),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["status"] }),
    onError: showApiError,
  });
  const measuredVolume = Number(volume.trim().replace(",", "."));
  const finish = useMutation({
    mutationFn: () => finishCalibration(measuredVolume),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["status"] });
      refreshPumps();
      setVolume("");
      toast.success("Calibration saved");
    },
    onError: showApiError,
  });

  const cleaningRunning =
    status?.kind === "cleaning" && status.state === "running";
  const calibrationRunning =
    status?.kind === "calibration" && status.state === "running";
  const calibrationMeasured =
    status?.kind === "calibration" && status.state === "finished";

  return (
    <div className="settings-page">
      <PageHeading
        title="Pumps"
        subtitle="Change bottles, assign ingredients, rinse and calibrate."
      />
      <nav className="pump-area-selector" aria-label="Pump tasks">
        <button
          aria-pressed={area === "bottles"}
          onClick={() => setArea("bottles")}
          type="button"
        >
          <Gauge size={19} /> Bottles
        </button>
        <button
          aria-pressed={area === "cleaning"}
          onClick={() => setArea("cleaning")}
          type="button"
        >
          <Droplets size={19} /> Cleaning
        </button>
        <button
          aria-pressed={area === "calibration"}
          onClick={() => setArea("calibration")}
          type="button"
        >
          <SlidersHorizontal size={19} /> Calibration
        </button>
      </nav>

      {!pumps.data ? (
        <QueryMessage query={pumps} />
      ) : area === "bottles" ? (
        <div className="pump-product-grid">
          {pumps.data.map((pump) => {
            const bottle = bottles.data?.find(
              (item) => item.pumpId === pump.id,
            );
            const ingredient = ingredients.data?.find(
              (item) => item.id === pump.ingredientId,
            );
            const percentage = bottle?.capacityMl
              ? Math.min(
                  100,
                  Math.max(0, (bottle.remainingMl / bottle.capacityMl) * 100),
                )
              : 0;
            const low = !!bottle && percentage <= 20;
            const bottleValue = bottle ?? {
              pumpId: pump.id,
              capacityMl: 700,
              remainingMl: 700,
            };
            return (
              <article
                className="pump-product-card"
                data-low={low || undefined}
                key={pump.id}
              >
                <div className="pump-card-top">
                  <span>Bottle {pump.id}</span>
                  <span className={pump.mlPerSec ? "status-chip" : "status-chip warning"}>
                    {pump.mlPerSec ? "Ready" : "Needs calibration"}
                  </span>
                </div>
                <div
                  className="bottle-visual"
                  aria-label={`${Math.round(percentage)} percent remaining`}
                >
                  <div className="bottle-neck" />
                  <div className="bottle-body">
                    <span style={{ height: `${percentage}%` }} />
                  </div>
                  {low && (
                    <button
                      className="replace-bottle-fab"
                      aria-label={`Mark bottle ${pump.id} as replaced`}
                      disabled={bottleMutation.isPending || busy}
                      onClick={() =>
                        bottleMutation.mutate({
                          bottle: bottleValue,
                          replaced: true,
                        })
                      }
                      type="button"
                    >
                      <RefreshCcw size={20} />
                    </button>
                  )}
                </div>
                <button
                  className="pump-ingredient-button"
                  disabled={busy}
                  onClick={() => {
                    setIngredientSearch("");
                    setAssigning(structuredClone(pump));
                  }}
                  type="button"
                >
                  <span>
                    <small>Ingredient</small>
                    <strong>{ingredient?.name ?? "Choose ingredient"}</strong>
                  </span>
                  <ChevronRight size={20} />
                </button>
                <div className="pump-product-copy">
                  <strong>
                    {bottle
                      ? `${Math.round(bottle.remainingMl)} ml of ${bottle.capacityMl} ml`
                      : "Set bottle size"}
                  </strong>
                  <small>{low ? "Running low" : "Estimated remaining"}</small>
                </div>
                <div className="pump-card-actions">
                  <button
                    onClick={() => setEditingBottle(structuredClone(bottleValue))}
                    type="button"
                  >
                    Bottle details
                  </button>
                  <button
                    onClick={() => {
                      setCalibrationPump(String(pump.id));
                      setArea("calibration");
                    }}
                    type="button"
                  >
                    Calibrate
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : area === "cleaning" ? (
        <section className="settings-card pump-task-card">
          <h2>Rinse pumps</h2>
          <p>
            Put the inlet tubes in clean water and place a large empty container
            under the outlet.
          </p>
          <label>
            Pumps to rinse
            <select
              value={cleaningPump}
              disabled={busy}
              onChange={(event) => setCleaningPump(event.target.value)}
            >
              <option value="all">All pumps</option>
              {pumps.data.map((pump) => (
                <option key={pump.id} value={pump.id}>
                  Pump {pump.id}
                </option>
              ))}
            </select>
          </label>
          {cleaningRunning ? (
            <>
              <p>{status.label}</p>
              <ProgressMeter value={status.progress} label="Cleaning progress" />
              <button
                className="danger-button"
                disabled={stopping}
                onClick={() => void stop()}
                type="button"
              >
                Stop rinsing
              </button>
            </>
          ) : (
            <button
              className="primary-button"
              disabled={busy || cleaning.isPending || !pumps.data.length}
              onClick={() => cleaning.mutate()}
              type="button"
            >
              {cleaning.isPending ? "Starting…" : "Start rinsing"}
            </button>
          )}
        </section>
      ) : (
        <section className="settings-card pump-task-card">
          <h2>
            {calibrationMeasured ? "Enter your measurement" : "Calibrate a pump"}
          </h2>
          <p>
            Put a measuring jug under the outlet. Neat runs the selected pump,
            then calculates its flow.
          </p>
          {!calibrationMeasured && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                calibration.mutate();
              }}
            >
              <div className="form-fields">
                <label>
                  Pump
                  <select
                    required
                    disabled={busy}
                    value={calibrationPump}
                    onChange={(event) => setCalibrationPump(event.target.value)}
                  >
                    <option value="">Choose a pump</option>
                    {pumps.data.map((pump) => (
                      <option key={pump.id} value={pump.id}>
                        Pump {pump.id}
                        {pump.mlPerSec ? " · calibrated" : " · not calibrated"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Run time · seconds
                  <input
                    type="number"
                    required
                    min={1}
                    max={120}
                    disabled={busy}
                    value={duration}
                    onChange={(event) => setDuration(Number(event.target.value))}
                  />
                </label>
              </div>
              {calibrationRunning ? (
                <>
                  <p>{status.label}</p>
                  <ProgressMeter
                    value={status.progress}
                    label="Calibration progress"
                  />
                  <button
                    className="danger-button"
                    disabled={stopping}
                    onClick={() => void stop()}
                    type="button"
                  >
                    Stop calibration
                  </button>
                </>
              ) : (
                <button
                  className="primary-button"
                  disabled={busy || calibration.isPending || !calibrationPump}
                >
                  Start calibration
                </button>
              )}
            </form>
          )}
          {calibrationMeasured && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                finish.mutate();
              }}
            >
              <div className="calibration-complete"><strong>Calibration run complete · 100%</strong><ProgressMeter value={100} label="Calibration complete" /></div>
              <label>
                Collected liquid · ml
                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]+([,.][0-9]+)?"
                  required
                  value={volume}
                  onChange={(event) => { const next = event.target.value; if (/^\d{0,5}([,.]\d{0,3})?$/.test(next)) setVolume(next); }}
                />
                <small>Comma and decimal point are both accepted.</small>
              </label>
              <div className="button-row">
                <button
                  className="secondary-button"
                  disabled={stopping || finish.isPending}
                  onClick={() => void stop()}
                  type="button"
                >
                  Discard
                </button>
                <button
                  className="primary-button"
                  disabled={finish.isPending || !Number.isFinite(measuredVolume) || measuredVolume <= 0}
                >
                  Save calibration
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <Modal
        open={requestedIngredientId !== null}
        onOpenChange={(open) => { if (!open && !assignment.isPending) setSearchParams({ area: "bottles" }); }}
        title={`Choose a pump for ${ingredients.data?.find((item) => item.id === requestedIngredientId)?.name ?? "ingredient"}`}
        description="Choose the physical pump this ingredient is connected to."
      >
        <div className="pump-choice-list">{pumps.data?.map((pump) => <button disabled={assignment.isPending} key={pump.id} onClick={() => { assignment.mutate({ pumpId: pump.id, ingredientId: requestedIngredientId }); setSearchParams({ area: "bottles" }); }} type="button"><strong>Pump {pump.id}</strong><small>{pump.ingredientId ? ingredients.data?.find((item) => item.id === pump.ingredientId)?.name ?? `Ingredient ${pump.ingredientId}` : "Available"}</small></button>)}</div>
      </Modal>
      <Modal
        open={!!assigning}
        onOpenChange={(open) => {
          if (!open && !assignment.isPending) setAssigning(null);
        }}
        title="Choose ingredient"
        description={`Select what is connected to bottle ${assigning?.id ?? ""}.`}
      >
        {assigning && (
          <>
          <SearchBar
            value={ingredientSearch}
            onChange={setIngredientSearch}
            placeholder="Search ingredients"
          />
          <div className="ingredient-choice-list">
            <button
              aria-pressed={assigning.ingredientId === null}
              onClick={() =>
                assignment.mutate({ pumpId: assigning.id, ingredientId: null })
              }
              type="button"
            >
              Unassigned
            </button>
            {ingredientChoices.map((ingredient) => (
              <button
                aria-pressed={assigning.ingredientId === ingredient.id}
                key={ingredient.id}
                onClick={() =>
                  assignment.mutate({
                    pumpId: assigning.id,
                    ingredientId: ingredient.id,
                  })
                }
                type="button"
              >
                {ingredient.name}
              </button>
            ))}
            {ingredientChoices.length === 0 && (
              <p className="ingredient-choice-empty">No ingredients found.</p>
            )}
          </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!editingBottle}
        onOpenChange={(open) => {
          if (!open && !bottleMutation.isPending) setEditingBottle(null);
        }}
        title={`Bottle ${editingBottle?.pumpId ?? ""}`}
        description="Keep the estimate useful for the next person."
      >
        {editingBottle && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              bottleMutation.mutate({ bottle: editingBottle, replaced: false });
            }}
          >
            <div className="form-fields">
              <label>
                Bottle capacity · ml
                <input
                  type="number"
                  min={1}
                  max={65535}
                  required
                  value={editingBottle.capacityMl}
                  onChange={(event) =>
                    setEditingBottle({
                      ...editingBottle,
                      capacityMl: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Estimated remaining · ml
                <input
                  type="number"
                  min={0}
                  step="any"
                  required
                  value={editingBottle.remainingMl}
                  onChange={(event) =>
                    setEditingBottle({
                      ...editingBottle,
                      remainingMl: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <div className="button-row">
              <button
                className="secondary-button"
                disabled={bottleMutation.isPending}
                onClick={() =>
                  bottleMutation.mutate({
                    bottle: editingBottle,
                    replaced: true,
                  })
                }
                type="button"
              >
                Bottle replaced
              </button>
              <button
                className="primary-button"
                disabled={bottleMutation.isPending}
              >
                Save estimate
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
