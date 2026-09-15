import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { QueryMessage } from "../components/QueryMessage";
import { CocktailGrid } from "../components/CocktailGrid";
import { PageInfoButton } from "../components/PageInfoButton";
import { getRecipes } from "../services/api";
import type { Cocktail } from "../types/cocktail";

const emptyCocktails: Cocktail[] = [];

export function MainCocktailPage({ search }: { search: string }) {
  const navigate = useNavigate();

  const recipesQuery = useQuery({
    queryKey: ["recipes"],
    queryFn: getRecipes,
  });
  const cocktails = (recipesQuery.data ?? emptyCocktails).filter(
    (recipe) => recipe.availability.available,
  );

  const filteredCocktails = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return cocktails;

    return cocktails.filter((cocktail) =>
      `${cocktail.name} ${cocktail.subtitle}`.toLowerCase().includes(query),
    );
  }, [cocktails, search]);

  return (
    <div className="cocktail-app dashboard-page">
      <main className="dashboard-content">
        <div className="dashboard-heading">
          <div>
            <span>Drink library</span>
            <div className="page-title-with-info">
              <h1>Choose your cocktail</h1>
              <PageInfoButton />
            </div>
          </div>
          <strong>{filteredCocktails.length} drinks available</strong>
        </div>
        {recipesQuery.isPending || recipesQuery.error ? (
          <QueryMessage query={recipesQuery} />
        ) : (
          <CocktailGrid
            cocktails={filteredCocktails}
            onSelect={(cocktail: Cocktail) =>
              navigate(`/prepare/${cocktail.id}`)
            }
          />
        )}
      </main>
    </div>
  );
}
