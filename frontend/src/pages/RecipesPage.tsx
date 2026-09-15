import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { CocktailImage } from "../components/CocktailImage";
import { PageHeading } from "../components/SettingsPrimitives";
import { SearchBar } from "../components/SearchBar";
import { QueryMessage } from "../components/QueryMessage";
import { getIngredients, getRecipes } from "../services/api";
export function RecipesPage() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
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
  return (
    <div className="settings-page">
      <PageHeading
        title="Recipes"
        subtitle="Your cocktail collection."
        action={
          <button
            className="primary-button"
            onClick={() => navigate("/settings/recipes/new")}
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
    </div>
  );
}
