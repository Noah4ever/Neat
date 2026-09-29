import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, LoaderCircle, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { CocktailImage } from "../components/CocktailImage";
import { PageHeading } from "../components/SettingsPrimitives";
import { SearchBar } from "../components/SearchBar";
import { QueryMessage } from "../components/QueryMessage";
import { Modal } from "../components/Modal";
import { mockRecipeSeed } from "../data/mockSeed";
import { getIngredients, getRecipes, installBuiltInRecipe } from "../services/api";
import { showApiError } from "../services/notifications";
export function RecipesPage() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<number[]>([]);
  const [installProgress, setInstallProgress] = useState(0);
  const query = useQuery({ queryKey: ["recipes"], queryFn: getRecipes });
  const recipes = query.data?.filter((recipe) =>
    recipe.name.toLowerCase().includes(search.toLowerCase()),
  );
  const ingredients = useQuery({
    queryKey: ["ingredients"],
    queryFn: getIngredients,
  });
  const ingredientName = (id: number) =>
    ingredients.data?.find((item) => item.id === id)?.name ??
      `Ingredient ${id}`;
  const install = useMutation({
    mutationFn: async (ids: number[]) => {
      setInstallProgress(0);
      for (let index = 0; index < ids.length; index += 1) {
        await installBuiltInRecipe(ids[index]!);
        setInstallProgress(index + 1);
      }
    },
    onSuccess: () => { setAddOpen(false); setSelectedTemplates([]); void cache.invalidateQueries({ queryKey: ["recipes"] }); void cache.invalidateQueries({ queryKey: ["ingredients"] }); },
    onError: showApiError,
  });
  const installedNames = new Set(query.data?.map((item) => item.name.toLocaleLowerCase()) ?? []);
  const suggestions = mockRecipeSeed.filter((item) => !installedNames.has(item.name.toLocaleLowerCase()));
  return (
    <div className="settings-page">
      <PageHeading
        title="Recipes"
        subtitle="Your cocktail collection."
        action={
          <button
            className="primary-button"
            onClick={() => setAddOpen(true)}
          >
            <Plus size={20} /> Add recipe
          </button>
        }
      />
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search recipes"
      />
      {!recipes ? (
        <QueryMessage query={query} />
      ) : (
        <div className="management-list">
          {recipes.map((recipe) => (
            <button
              className="management-row"
              key={recipe.id}
              onClick={() => navigate(`/settings/recipes/${recipe.id}`)}
            >
              <CocktailImage
                cocktail={recipe}
                className="management-row__image"
              />
              <span className="management-row__copy">
                <strong>{recipe.name}</strong>
                <small>
                  {recipe.subtitle ||
                    `${recipe.ingredients.length} ingredients`}
                </small>
                {!recipe.availability.available && (
                  <small className="availability-reason">
                    {recipe.availability.missingIngredientIds
                      .map((id) => `${ingredientName(id)} missing`)
                      .concat(
                        recipe.availability.uncalibratedIngredientIds.map(
                          (id) => `${ingredientName(id)} needs calibration`,
                        ),
                      )
                      .join(" · ")}
                  </small>
                )}
              </span>
              <ChevronRight size={20} />
            </button>
          ))}
          {!recipes.length && <p className="empty-state">No recipes found.</p>}
        </div>
      )}
      <Modal open={addOpen} onOpenChange={(open) => { if (!install.isPending) { setAddOpen(open); if (!open) setSelectedTemplates([]); } }} title="Add recipes" description="Choose several Neat recipes or build your own.">
        <div className="recipe-suggestion-list">
          <button onClick={() => navigate("/settings/recipes/new")} type="button"><span className="blank-recipe-icon"><Plus /></span><span><strong>Create from scratch</strong><small>Build your own mix</small></span><ChevronRight /></button>
          {suggestions.map((recipe) => { const selected = selectedTemplates.includes(recipe.id); return <button aria-pressed={selected} className={selected ? "selected" : ""} disabled={install.isPending} key={recipe.id} onClick={() => setSelectedTemplates((current) => selected ? current.filter((value) => value !== recipe.id) : [...current, recipe.id])} type="button"><CocktailImage cocktail={{ ...recipe, subtitle: recipe.subtitle ?? "", description: recipe.description ?? "", ingredients: [], preparationSteps: recipe.preparationSteps }} /><span><strong>{recipe.name}</strong><small>Creates its ingredients automatically</small></span>{selected ? <Check /> : <Plus />}</button>; })}
        </div>
        <button className="primary-button add-all-recipes" disabled={!selectedTemplates.length || install.isPending} onClick={() => install.mutate(selectedTemplates)} type="button">{install.isPending ? <><LoaderCircle className="install-spinner" /> Adding {Math.min(installProgress + 1, selectedTemplates.length)} of {selectedTemplates.length}…</> : `Add ${selectedTemplates.length || "selected"} recipe${selectedTemplates.length === 1 ? "" : "s"}`}</button>
      </Modal>
    </div>
  );
}
