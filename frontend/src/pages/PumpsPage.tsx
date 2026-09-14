import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, Wine } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../components/Modal";
import { PageHeading } from "../components/SettingsPrimitives";
import { QueryMessage } from "../components/QueryMessage";
import {
  assignPump,
  deletePump,
  getBottles,
  getIngredients,
  getPumps,
  savePump,
  updateBottle,
} from "../services/api";
import { useDrinkSession } from "../state/useDrinkSession";
import type { BottleState, PumpConfig } from "../types/device";
import { showApiError } from "../services/notifications";
export function PumpsPage() {
  const pumps = useQuery({ queryKey: ["pumps"], queryFn: getPumps });
  const ingredients = useQuery({
    queryKey: ["ingredients"],
    queryFn: getIngredients,
  });
  const bottles = useQuery({ queryKey: ["bottles"], queryFn: getBottles });
  const cache = useQueryClient();
  const { busy } = useDrinkSession();
  const [editing, setEditing] = useState<PumpConfig | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [editingBottle, setEditingBottle] = useState<BottleState | null>(null);
  const mutation = useMutation({
    mutationFn: async (remove: boolean) => {
      if (!editing) return;
      if (remove) await deletePump(editing.id);
      else {
        await savePump(editing, isNew);
        if (!isNew) await assignPump(editing.id, editing.ingredientId);
      }
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["pumps"] });
      setEditing(null);
      toast.success("Pumps updated");
    },
    onError: showApiError,
  });
  const bottleMutation = useMutation({
    mutationFn: async (replaced: boolean) => {
      if (!editingBottle) return;
      await updateBottle(editingBottle.pumpId, {
        capacityMl: editingBottle.capacityMl,
        remainingMl: replaced
          ? editingBottle.capacityMl
          : editingBottle.remainingMl,
      });
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["bottles"] });
      setEditingBottle(null);
      toast.success("Bottle estimate updated");
    },
    onError: showApiError,
  });
  return (
    <div className="settings-page">
      <PageHeading
        title="Pumps"
        subtitle="Assign an ingredient and output to each pump."
        action={
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => {
              setIsNew(true);
              setConfirm(false);
              setEditing({
                id:
                  Math.max(0, ...(pumps.data ?? []).map((item) => item.id)) + 1,
                ingredientId: null,
                mlPerSec: null,
                output: { type: 0, channel: 4 },
              });
            }}
          >
            <Plus size={20} /> Add pump
          </button>
        }
      />
      {!pumps.data ? (
        <QueryMessage query={pumps} />
      ) : (
        <>
          <h2 className="settings-section-label">Pump setup</h2>
          <div className="management-list">
            {pumps.data.map((pump) => (
              <button
                key={pump.id}
                className="management-row"
                disabled={busy}
                onClick={() => {
                  setIsNew(false);
                  setConfirm(false);
                  setEditing(structuredClone(pump));
                }}
              >
                <span className="management-row__copy">
                  <strong>
                    Pump {pump.id} ·{" "}
                    {ingredients.data?.find(
                      (item) => item.id === pump.ingredientId,
                    )?.name ?? "Unassigned"}
                  </strong>
                  <small>
                    GPIO {pump.output.channel} ·{" "}
                    {pump.mlPerSec
                      ? `${pump.mlPerSec.toFixed(2)} ml/s`
                      : "Needs calibration"}
                  </small>
                </span>
                <ChevronRight size={20} />
              </button>
            ))}
          </div>
        </>
      )}
      {busy && (
        <p className="muted">
          Finish or stop the current operation before editing pumps.
        </p>
      )}
      {!!pumps.data?.length && (
        <section className="bottle-section">
          <div className="section-heading">
            <div>
              <h2>Bottle estimates</h2>
              <p className="muted">
                Estimated amounts help with refills and never block a drink.
              </p>
            </div>
          </div>
          <div className="bottle-list">
            {pumps.data.map((pump) => {
              const bottle = bottles.data?.find(
                (item) => item.pumpId === pump.id,
              );
              const percentage = bottle?.capacityMl
                ? Math.min(100, (bottle.remainingMl / bottle.capacityMl) * 100)
                : 0;
              const ingredient = ingredients.data?.find(
                (item) => item.id === pump.ingredientId,
              );
              return (
                <article
                  className="bottle-row"
                  data-low={bottle ? percentage <= 20 : undefined}
                  key={pump.id}
                >
                  <Wine size={24} />
                  <div className="bottle-row__content">
                    <div className="bottle-row__heading">
                      <span>
                        <strong>{ingredient?.name ?? "Unassigned"}</strong>
                        <small>Pump {pump.id}</small>
                      </span>
                      <span className="bottle-row__amount">
                        <small>Estimated remaining</small>
                        <strong>
                          {bottle
                            ? `${Math.round(bottle.remainingMl)} ml of ${bottle.capacityMl} ml`
                            : "Not configured"}
                        </strong>
                      </span>
                    </div>
                    <div
                      className="bottle-level"
                      role="progressbar"
                      aria-label={`Estimated amount for pump ${pump.id}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(percentage)}
                    >
                      <span style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setEditingBottle(
                        bottle
                          ? structuredClone(bottle)
                          : { pumpId: pump.id, capacityMl: 700, remainingMl: 700 },
                      )
                    }
                  >
                    {bottle ? "Bottle details" : "Set bottle"}
                    <ChevronRight size={18} />
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <Modal
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setEditing(null);
        }}
        title={
          confirm ? "Delete pump?" : isNew ? "Add pump" : `Pump ${editing?.id}`
        }
        description={
          confirm
            ? "This removes its configuration."
            : "The current firmware uses GPIO outputs."
        }
      >
        {editing &&
          (confirm ? (
            <div className="button-row">
              <button
                className="secondary-button"
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={mutation.isPending || busy}
                onClick={() => mutation.mutate(true)}
              >
                Delete pump
              </button>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate(false);
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
                    disabled={!isNew}
                    value={editing.id}
                    onChange={(event) =>
                      setEditing({ ...editing, id: Number(event.target.value) })
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
                    value={editing.output.channel}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        output: {
                          type: 0,
                          channel: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Ingredient
                  <select
                    value={editing.ingredientId ?? ""}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        ingredientId:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  >
                    <option value="">Unassigned</option>
                    {ingredients.data?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Calibrated flow · ml/s
                  <input
                    type="number"
                    min={0.001}
                    step="any"
                    placeholder="Not calibrated"
                    value={editing.mlPerSec ?? ""}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        mlPerSec:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <div className="button-row">
                {!isNew && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => setConfirm(true)}
                  >
                    Delete
                  </button>
                )}
                <button
                  className="primary-button"
                  disabled={mutation.isPending || busy}
                >
                  Save pump
                </button>
              </div>
            </form>
          ))}
      </Modal>
      <Modal
        open={!!editingBottle}
        onOpenChange={(open) => {
          if (!open && !bottleMutation.isPending) setEditingBottle(null);
        }}
        title={`Bottle on pump ${editingBottle?.pumpId ?? ""}`}
        description="This is an estimate and does not prevent dispensing."
      >
        {editingBottle && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              bottleMutation.mutate(false);
            }}
          >
            <div className="form-fields">
              <label>
                Bottle capacity · ml
                <input
                  type="number"
                  min={0}
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
            <div className="button-row bottle-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={bottleMutation.isPending}
                onClick={() => bottleMutation.mutate(true)}
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
