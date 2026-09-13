import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../components/Modal";
import { PageHeading } from "../components/SettingsPrimitives";
import { QueryMessage } from "../components/QueryMessage";
import {
  assignPump,
  deletePump,
  getIngredients,
  getPumps,
  savePump,
} from "../services/api";
import { useDrinkSession } from "../state/useDrinkSession";
import type { PumpConfig } from "../types/device";
export function PumpsPage() {
  const pumps = useQuery({ queryKey: ["pumps"], queryFn: getPumps });
  const ingredients = useQuery({
    queryKey: ["ingredients"],
    queryFn: getIngredients,
  });
  const cache = useQueryClient();
  const { busy } = useDrinkSession();
  const [editing, setEditing] = useState<PumpConfig | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirm, setConfirm] = useState(false);
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
    onError: (error) => toast.error(error.message),
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
      )}
      {busy && (
        <p className="muted">
          Finish or stop the current operation before editing pumps.
        </p>
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
    </div>
  );
}
