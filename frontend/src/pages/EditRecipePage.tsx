import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ImagePlus,
  Plus,
  Trash2,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CocktailImage } from "../components/CocktailImage";
import { Modal } from "../components/Modal";
import { PageInfoButton } from "../components/PageInfoButton";
import { QueryMessage } from "../components/QueryMessage";
import { cocktailImages } from "../data/cocktailImages";
import {
  deleteImage,
  deleteRecipe,
  assignPump,
  getDeviceSettings,
  getIngredients,
  getPumps,
  getRecipe,
  saveRecipe,
  uploadImage,
} from "../services/api";
import { prepareRecipeImage } from "../services/imageProcessing";
import { showApiError } from "../services/notifications";
import type { Cocktail } from "../types/cocktail";
import type { PreparationStep } from "../types/device";

const blank: Cocktail = {
  id: 0,
  name: "",
  imageKey: null,
  subtitle: "",
  description: "",
  baseSizeMl: 400,
  preparationSteps: [],
  availability: {
    available: false,
    missingIngredientIds: [],
    uncalibratedIngredientIds: [],
  },
  strengthAdjustmentAvailable: false,
  ingredients: [],
};
function IntegerTextField({ value, onChange, label }: { value: number; onChange: (value: number) => void; label?: string }) {
  const [draft, setDraft] = useState(String(value));
  return <input aria-label={label} inputMode="numeric" pattern="[0-9]*" required value={draft} onChange={(event) => {
    const next = event.target.value.replace(/\D/g, "").slice(0, 5);
    setDraft(next);
    if (next) onChange(Math.min(65535, Number(next)));
  }} onBlur={() => { if (!draft) { setDraft("1"); onChange(1); } }} />;
}
export function EditRecipePage() {
  const { id } = useParams();
  const settings = useQuery({
    queryKey: ["device-settings"],
    queryFn: getDeviceSettings,
  });
  const query = useQuery({
    queryKey: ["recipe", Number(id)],
    queryFn: () => getRecipe(Number(id)),
    enabled: id !== "new",
  });
  if (id !== "new" && !query.data) return <QueryMessage query={query} />;
  if (!settings.data) return <QueryMessage query={settings} />;
  return (
    <RecipeEditor
      key={id}
      initial={
        id === "new"
          ? { ...blank, baseSizeMl: settings.data.defaultDrinkSizeMl }
          : query.data!
      }
    />
  );
}
function RecipeEditor({ initial }: { initial: Cocktail }) {
  const [recipe, setRecipe] = useState(() => structuredClone(initial));
  const [adding, setAdding] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assigningIngredient, setAssigningIngredient] = useState<number | null>(null);
  const originalImage = useRef(initial.imageKey);
  const navigate = useNavigate();
  const cache = useQueryClient();
  const ingredients = useQuery({
    queryKey: ["ingredients"],
    queryFn: getIngredients,
  });
  const pumps = useQuery({ queryKey: ["pumps"], queryFn: getPumps });
  const assign = useMutation({
    mutationFn: (pumpId: number) => assignPump(pumpId, assigningIngredient),
    onSuccess: async () => {
      const ingredientId = assigningIngredient;
      setAssigningIngredient(null);
      await cache.invalidateQueries({ queryKey: ["pumps"] });
      await cache.invalidateQueries({ queryKey: ["recipes"] });
      if (ingredientId != null) setRecipe((current) => ({ ...current, availability: { ...current.availability, missingIngredientIds: current.availability.missingIngredientIds.filter((value) => value !== ingredientId) } }));
      toast.success("Pump assigned");
    },
    onError: showApiError,
  });
  const mutation = useMutation({
    mutationFn: async (remove: boolean) => {
      if (remove) {
        await deleteRecipe(recipe.id);
        return;
      }
      await saveRecipe({ ...recipe, name: recipe.name.trim() }, !recipe.id);
      if (
        originalImage.current?.startsWith("media:") &&
        originalImage.current !== recipe.imageKey
      )
        await deleteImage(originalImage.current);
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
  const ingredientName = (id: number) => ingredients.data?.find((item) => item.id === id)?.name ?? `Ingredient ${id}`;
  const updateStep = (index: number, patch: Partial<PreparationStep>) =>
    setRecipe({
      ...recipe,
      preparationSteps: recipe.preparationSteps.map((step, i) =>
        i === index ? { ...step, ...patch } : step,
      ),
    });
  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= recipe.preparationSteps.length) return;
    const steps = [...recipe.preparationSteps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setRecipe({ ...recipe, preparationSteps: steps });
  };
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
        <div className="page-title-with-info">
          <h1>{recipe.id ? "Edit recipe" : "New recipe"}</h1>
          <PageInfoButton />
        </div>
        <button
          className="primary-button"
          disabled={
            mutation.isPending ||
            uploading ||
            !recipe.name.trim() ||
            !recipe.ingredients.length ||
            recipe.baseSizeMl < 1
          }
        >
          Save
        </button>
      </div>
      {!recipe.availability.available && recipe.id > 0 && (
        <section className="availability-note">
          <strong>This recipe is not ready yet</strong>
          <div className="availability-actions">
            {recipe.availability.missingIngredientIds.filter((ingredientId) => recipe.ingredients.find((item) => item.ingredientId === ingredientId)?.machineDispensed !== false).map((ingredientId) => <div className="availability-action-row" key={`missing-${ingredientId}`}><span>{ingredientName(ingredientId)} is not connected to a pump</span><button onClick={() => setAssigningIngredient(ingredientId)} type="button">Choose pump</button><button onClick={() => setRecipe({ ...recipe, ingredients: recipe.ingredients.map((item) => item.ingredientId === ingredientId ? { ...item, machineDispensed: false } : item), availability: { ...recipe.availability, missingIngredientIds: recipe.availability.missingIngredientIds.filter((value) => value !== ingredientId) } })} type="button">Keep outside Neat</button></div>)}
            {recipe.availability.uncalibratedIngredientIds.map((ingredientId) => { const pump = pumps.data?.find((item) => item.ingredientId === ingredientId); return <button key={`calibration-${ingredientId}`} onClick={() => navigate(`/settings/pumps?area=calibration${pump ? `&pump=${pump.id}` : ""}`)} type="button"><span>{ingredientName(ingredientId)} needs calibration</span><small>Calibrate ›</small></button>; })}
          </div>
        </section>
      )}
      <div className="edit-recipe-grid">
        <div>
          <CocktailImage cocktail={recipe} className="editor-image" />
          <div className="image-actions">
            <label className="secondary-button">
              <ImagePlus size={18} />
              {uploading
                ? "Processing…"
                : recipe.imageKey
                  ? "Replace image"
                  : "Upload image"}
              <input
                hidden
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  try {
                    const blob = await prepareRecipeImage(file);
                    const uploaded = await uploadImage(blob);
                    setRecipe((current) => ({
                      ...current,
                      imageKey: uploaded.imageKey,
                    }));
                  } catch (error) {
                    showApiError(error);
                  } finally {
                    setUploading(false);
                    event.target.value = "";
                  }
                }}
              />
            </label>
            {recipe.imageKey && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setRecipe({ ...recipe, imageKey: null })}
              >
                Remove
              </button>
            )}
          </div>
          <label>
            Built-in image
            <select
              value={
                recipe.imageKey?.startsWith("media:")
                  ? ""
                  : (recipe.imageKey ?? "")
              }
              onChange={(event) =>
                setRecipe({ ...recipe, imageKey: event.target.value || null })
              }
            >
              <option value="">None</option>
              {Object.keys(cocktailImages).map((key) => (
                <option key={key} value={key}>
                  {key}
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
          <label>
            Subtitle
            <input
              maxLength={120}
              value={recipe.subtitle}
              onChange={(event) =>
                setRecipe({ ...recipe, subtitle: event.target.value })
              }
            />
          </label>
          <label>
            Description
            <textarea
              maxLength={500}
              rows={4}
              value={recipe.description}
              onChange={(event) =>
                setRecipe({ ...recipe, description: event.target.value })
              }
            />
          </label>
          <label>
            Recipe size · ml
            <IntegerTextField value={recipe.baseSizeMl} onChange={(baseSizeMl) => setRecipe({ ...recipe, baseSizeMl })} />
            <small>
              Enter ingredient amounts for this size. Neat scales them for other
              drink sizes.
            </small>
          </label>
        </div>
      </div>
      <h2>Ingredients</h2>
      <p className="muted">
        Base amounts before size and strength adjustments.
      </p>
      <div className="ingredient-editor">
        {recipe.ingredients.map((item) => (
          <div className="ingredient-editor-row" key={item.id}>
            <div className="ingredient-editor-name">
              <strong>{item.name}</strong>
              <small>
                {item.category.charAt(0) + item.category.slice(1).toLowerCase()}
              </small>
            </div>
            <label className="amount-field">
              <span className="sr-only">{item.name} amount</span>
              <IntegerTextField label={`${item.name} amount`} value={item.amountMl} onChange={(amountMl) => setRecipe({ ...recipe, ingredients: recipe.ingredients.map((value) => value.id === item.id ? { ...value, amountMl, amount: `${amountMl} ml` } : value) })} />
              <span>ml</span>
            </label>
            <select aria-label={`${item.name} dispensing mode`} className="ingredient-mode-select" value={item.machineDispensed === false ? "manual" : "machine"} onChange={(event) => {
              const machineDispensed = event.target.value === "machine";
              setRecipe({ ...recipe, ingredients: recipe.ingredients.map((value) => value.id === item.id ? { ...value, machineDispensed } : value) });
              if (machineDispensed && !pumps.data?.some((pump) => pump.ingredientId === item.ingredientId)) setAssigningIngredient(item.ingredientId);
            }}><option value="machine">Dispense with Neat</option><option value="manual">Add manually</option></select>
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
                  {
                    ...item,
                    id: item.id,
                    ingredientId: item.id,
                    amountMl: 30,
                    machineDispensed: true,
                    amount: "30 ml",
                  },
                ],
              });
            setAdding("");
          }}
        >
          <Plus size={20} /> Add
        </button>
      </div>
      <div className="section-heading">
        <div>
          <h2>Preparation</h2>
          <p className="muted">
            Instructions shown before or after dispensing.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            setRecipe({
              ...recipe,
              preparationSteps: [
                ...recipe.preparationSteps,
                { phase: "BEFORE", text: "" },
              ],
            })
          }
        >
          <Plus size={18} /> Add step
        </button>
      </div>
      <div className="preparation-editor">
        {recipe.preparationSteps.map((step, index) => (
          <div className="preparation-editor-row" key={index}>
            <select
              aria-label={`Phase for step ${index + 1}`}
              value={step.phase}
              onChange={(event) =>
                updateStep(index, {
                  phase: event.target.value as PreparationStep["phase"],
                })
              }
            >
              <option value="BEFORE">Before</option>
              <option value="AFTER">After</option>
            </select>
            <input
              aria-label={`Text for step ${index + 1}`}
              required
              maxLength={180}
              value={step.text}
              onChange={(event) =>
                updateStep(index, { text: event.target.value })
              }
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Move up"
              disabled={index === 0}
              onClick={() => moveStep(index, -1)}
            >
              <ArrowUp size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Move down"
              disabled={index === recipe.preparationSteps.length - 1}
              onClick={() => moveStep(index, 1)}
            >
              <ArrowDown size={18} />
            </button>
            <button
              type="button"
              className="icon-button danger-text"
              aria-label="Remove step"
              onClick={() =>
                setRecipe({
                  ...recipe,
                  preparationSteps: recipe.preparationSteps.filter(
                    (_, i) => i !== index,
                  ),
                })
              }
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
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
        open={assigningIngredient !== null}
        onOpenChange={(open) => { if (!open && !assign.isPending) setAssigningIngredient(null); }}
        title={`Choose a pump for ${assigningIngredient == null ? "ingredient" : ingredientName(assigningIngredient)}`}
        description="Select the physical pump this ingredient is connected to. Its current assignment will be replaced."
      >
        <div className="pump-choice-list">{pumps.data?.map((pump) => <button disabled={assign.isPending} key={pump.id} onClick={() => assign.mutate(pump.id)} type="button"><strong>Pump {pump.id}</strong><small>{pump.ingredientId ? ingredientName(pump.ingredientId) : "Available"}</small></button>)}</div>
      </Modal>
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
