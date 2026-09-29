import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { UsersRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { QueryMessage } from "../components/QueryMessage";
import { CocktailGrid } from "../components/CocktailGrid";
import { PageInfoButton } from "../components/PageInfoButton";
import { getDevice, getRecipes } from "../services/api";
import { getCloudConfig, getCloudQueue } from "../services/cloud";
import type { Cocktail } from "../types/cocktail";
import { tr } from "../services/language";

const emptyCocktails: Cocktail[] = [];

export function MainCocktailPage({ search }: { search: string }) {
  const navigate = useNavigate();

  const recipesQuery = useQuery({
    queryKey: ["recipes"],
    queryFn: getRecipes,
  });
  const cloud = getCloudConfig();
  const deviceQuery = useQuery({ queryKey: ["device"], queryFn: getDevice });
  const machineId = deviceQuery.data?.id ?? cloud.machineId;
  const queueQuery = useQuery({
    queryKey: ["cloud-queue", machineId],
    queryFn: () => getCloudQueue(machineId),
    enabled: !!machineId,
    refetchInterval: 5_000,
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
            <span>{tr("Drink library", "Cocktailauswahl")}</span>
            <div className="page-title-with-info">
              <h1>{tr("Choose your cocktail", "Wähle deinen Cocktail")}</h1>
              <PageInfoButton />
            </div>
          </div>
          <div className="dashboard-queue-actions">
            <strong>{filteredCocktails.length} {tr("drinks available", "Cocktails verfügbar")}</strong>
            <button
              className="queue-shortcut"
              onClick={() => navigate("/queue")}
              type="button"
            >
              <UsersRound size={19} />
              {queueQuery.data?.length
                ? `${queueQuery.data.length} waiting`
                : tr("Guest queue", "Warteschlange")}
            </button>
          </div>
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
