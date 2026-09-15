import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../components/Modal";
import { PageHeading } from "../components/SettingsPrimitives";
import { SearchBar } from "../components/SearchBar";
import { QueryMessage } from "../components/QueryMessage";
import {
  deleteIngredient,
  getIngredients,
  saveIngredient,
} from "../services/api";
import { showApiError } from "../services/notifications";
import type { Ingredient } from "../types/device";

export function IngredientsPage() {
  const query = useQuery({
    queryKey: ["ingredients"],
    queryFn: getIngredients,
  });
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mutation = useMutation({
    mutationFn: async (remove: boolean) => {
      if (!editing) return;
      if (remove) await deleteIngredient(editing.id);
      else
        await saveIngredient(
          { ...editing, name: editing.name.trim() },
          editing.id === 0,
        );
    },
    onSuccess: () => {
      void cache.invalidateQueries();
      setEditing(null);
      setConfirmDelete(false);
      toast.success("Ingredients updated");
    },
    onError: showApiError,
  });
  return (
    <div className="settings-page">
      <PageHeading
        title="Ingredients"
        subtitle="The ingredients available to your machine."
        action={
          <button
            className="primary-button"
            onClick={() => {
              setConfirmDelete(false);
              setEditing({ id: 0, name: "", category: "OTHER" });
            }}
          >
            <Plus size={20} /> Add ingredient
          </button>
        }
      />
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search ingredients"
      />
      {!query.data ? (
        <QueryMessage query={query} />
      ) : (
        <div className="management-list">
          {query.data
            .filter((item) =>
              item.name.toLowerCase().includes(search.toLowerCase()),
            )
            .map((item) => (
              <button
                className="management-row"
                key={item.id}
                onClick={() => {
                  setConfirmDelete(false);
                  setEditing(item);
                }}
              >
                <span className="management-row__copy">
                  <strong>{item.name}</strong>
                  <small>
                    {item.category.charAt(0) +
                      item.category.slice(1).toLowerCase()}{" "}
                    · Ingredient {item.id}
                  </small>
                </span>
                <ChevronRight size={20} />
              </button>
            ))}
          {query.data.length === 0 && (
            <p className="empty-state">Add your first ingredient.</p>
          )}
        </div>
      )}
      <Modal
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setEditing(null);
        }}
        title={
          confirmDelete
            ? "Delete ingredient?"
            : editing?.id
              ? "Edit ingredient"
              : "Add ingredient"
        }
        description={
          confirmDelete
            ? "An ingredient in use must be removed from its recipes and pumps first."
            : "Use a short, recognizable name."
        }
      >
        {confirmDelete ? (
          <div className="button-row">
            <button
              className="secondary-button"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
            <button
              className="danger-button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(true)}
            >
              Delete ingredient
            </button>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate(false);
            }}
          >
            <label>
              Name
              <input
                autoFocus
                required
                maxLength={80}
                value={editing?.name ?? ""}
                onChange={(event) =>
                  setEditing(
                    (current) =>
                      current && { ...current, name: event.target.value },
                  )
                }
              />
            </label>
            <label>
              Category
              <select
                value={editing?.category ?? "OTHER"}
                onChange={(event) =>
                  setEditing(
                    (current) =>
                      current && {
                        ...current,
                        category: event.target.value as Ingredient["category"],
                      },
                  )
                }
              >
                <option value="ALCOHOL">Alcohol</option>
                <option value="JUICE">Juice</option>
                <option value="MIXER">Mixer</option>
                <option value="SYRUP">Syrup</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <div className="button-row">
              {!!editing?.id && (
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </button>
              )}
              <button
                className="primary-button"
                disabled={mutation.isPending || !editing?.name.trim()}
              >
                {mutation.isPending ? "Saving…" : "Save ingredient"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
