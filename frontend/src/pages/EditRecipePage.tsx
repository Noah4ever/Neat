import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CocktailImage } from "../components/CocktailImage";
import { Modal } from "../components/Modal";
import { QueryMessage } from "../components/QueryMessage";
import {
  deleteRecipe,
  getIngredients,
  getRecipe,
  recipeItems,
  saveRecipe,
} from "../services/api";
import type { Cocktail } from "../types/cocktail";
import { cocktailImages } from "../data/cocktailImages";
import { showApiError } from "../services/notifications";
const blank: Cocktail = {
  id: 0,
  name: "",
  imageKey: null,
  subtitle: "",
  description: "",
  ingredients: [],
  manualItems: [],
  availableSizes: [300, 400, 500],
  defaultSize: 400,
  defaultStrength: "standard",
};
export function EditRecipePage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ["recipe", Number(id)],
    queryFn: () => getRecipe(Number(id)),
    enabled: id !== "new",
  });
  if (id !== "new" && !query.data) return <QueryMessage query={query} />;
  return <RecipeEditor key={id} initial={id === "new" ? blank : query.data!} />;
}
function RecipeEditor({ initial }: { initial: Cocktail }) {
  const [recipe, setRecipe] = useState(() => ({
    ...initial,
    ingredients: initial.ingredients.map((item, index) => ({
      ...item,
      amount: `${recipeItems(initial)[index].amountMl} ml`,
    })),
  }));
  const [adding, setAdding] = useState("");
  const [confirm, setConfirm] = useState(false);
  const navigate = useNavigate();
  const cache = useQueryClient();
  const ingredients = useQuery({
    queryKey: ["ingredients"],
    queryFn: getIngredients,
  });
  const mutation = useMutation({
    mutationFn: async (remove: boolean) => {
      if (remove) await deleteRecipe(recipe.id);
      else
        await saveRecipe({ ...recipe, name: recipe.name.trim() }, !recipe.id);
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["recipes"] });
      void cache.invalidateQueries({ queryKey: ["recipe"] });
      navigate("/settings/recipes");
      toast.success("Recipes updated");
    },
    onError: showApiError,
  });
  const available =
    ingredients.data?.filter(
      (item) => !recipe.ingredients.some((value) => value.id === item.id),
    ) ?? [];
  return (
    <form
      className="settings-page"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(false);
      }}
    >
      <div className="edit-heading">
        <button
          type="button"
          className="secondary-button"
          onClick={() => navigate("/settings/recipes")}
        >
          <ChevronLeft size={20} /> Recipes
        </button>
        <h1>{recipe.id ? "Edit recipe" : "New recipe"}</h1>
        <button
          className="primary-button"
          disabled={
            mutation.isPending ||
            !recipe.name.trim() ||
            !recipe.ingredients.length
          }
        >
          Save
        </button>
      </div>
      <div className="edit-recipe-grid">
        <div>
          <CocktailImage cocktail={recipe} className="editor-image" />
          <label className="image-picker">
            Image
            <select
              value={recipe.imageKey ?? ""}
              onChange={(event) =>
                setRecipe({
                  ...recipe,
                  imageKey: event.target.value || null,
                })
              }
            >
              <option value="">Neat placeholder</option>
              {Object.keys(cocktailImages).map((imageKey) => (
                <option key={imageKey} value={imageKey}>
                  {imageKey}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-fields">
          <label>
            Name
            <input
              required
              maxLength={80}
              value={recipe.name}
              onChange={(event) =>
                setRecipe({ ...recipe, name: event.target.value })
              }
            />
          </label>
        </div>
      </div>
      <h2>Ingredients</h2>
      <p className="muted">
        Amounts for the base recipe, before size and strength adjustments.
      </p>
      <div className="ingredient-editor">
        {recipe.ingredients.map((item) => (
          <div className="ingredient-editor-row" key={item.id}>
            <div className="ingredient-editor-name">
              <strong>{item.name}</strong>
            </div>
            <label className="amount-field">
              <span className="sr-only">{item.name} amount in ml</span>
              <input
                type="number"
                required
                min={1}
                max={65535}
                step={1}
                value={parseFloat(item.amount) || ""}
                onChange={(event) =>
                  setRecipe({
                    ...recipe,
                    ingredients: recipe.ingredients.map((value) =>
                      value.id === item.id
                        ? { ...value, amount: `${event.target.value} ml` }
                        : value,
                    ),
                  })
                }
              />
              <span>ml</span>
            </label>
            <button
              type="button"
              className="icon-button danger-text"
              aria-label={`Remove ${item.name}`}
              onClick={() =>
                setRecipe({
                  ...recipe,
                  ingredients: recipe.ingredients.filter(
                    (value) => value.id !== item.id,
                  ),
                })
              }
            >
              <Trash2 size={20} />
            </button>
          </div>
        ))}
      </div>
      {ingredients.error && <QueryMessage query={ingredients} />}
      <div className="button-row">
        <select
          aria-label="Ingredient to add"
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
        >
          <option value="">Choose an ingredient</option>
          {available.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="secondary-button"
          disabled={!adding}
          onClick={() => {
            const item = available.find((value) => value.id === Number(adding));
            if (item)
              setRecipe({
                ...recipe,
                ingredients: [
                  ...recipe.ingredients,
                  { ...item, amount: "30 ml", category: "Mixer" },
                ],
              });
            setAdding("");
          }}
        >
          <Plus size={20} /> Add
        </button>
      </div>
      {!!recipe.id && (
        <button
          type="button"
          className="danger-button delete-recipe"
          onClick={() => setConfirm(true)}
        >
          Delete recipe
        </button>
      )}
      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete recipe?"
        description={`Remove ${recipe.name} from your collection?`}
      >
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setConfirm(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(true)}
          >
            Delete recipe
          </button>
        </div>
      </Modal>
    </form>
  );
}
