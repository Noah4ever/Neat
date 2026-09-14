import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { CocktailImage } from "../components/CocktailImage";
import { SegmentedOptionGroup } from "../components/SegmentedOptionGroup";
import { useDrinkSession } from "../state/useDrinkSession";
import { drinkOverrides, getRecipe } from "../services/api";
import type { Cocktail, DrinkStrength } from "../types/cocktail";
import { QueryMessage } from "../components/QueryMessage";
import { showApiErrorWithRetry } from "../services/notifications";

export function PrepareCocktailPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ["recipe", id],
    queryFn: () => getRecipe(Number(id)),
  });
  if (!query.data) return <QueryMessage query={query} />;
  return <Preparation key={query.data.id} cocktail={query.data} />;
}
function Preparation({ cocktail }: { cocktail: Cocktail }) {
  const [size, setSize] = useState(cocktail.defaultSize);
  const [strength, setStrength] = useState<DrinkStrength>(
    cocktail.defaultStrength,
  );
  const { start, busy } = useDrinkSession();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: () =>
      start(cocktail, {
        recipeId: cocktail.id,
        overrides: drinkOverrides(cocktail, size, strength),
      }),
    onSuccess: () => navigate("/progress"),
    onError: (error) => showApiErrorWithRetry(error, () => mutation.mutate()),
  });
  return (
    <main className="prepare-layout">
      <section className="prepare-art">
        <CocktailImage cocktail={cocktail} className="prepare-image" />
        <span>{cocktail.subtitle}</span>
      </section>
      <section className="prepare-details">
        <div className="prepare-title">
          <span className="eyebrow">Your next favourite</span>
          <h1>{cocktail.name}</h1>
          <p>{cocktail.description || "Made fresh, just for you."}</p>
        </div>
        <div className="control-block">
          <span className="control-step">1</span>
          <h2>Drink size</h2>
          <SegmentedOptionGroup
            label="Drink size"
            value={size}
            onChange={setSize}
            options={cocktail.availableSizes.map((value) => ({
              value,
              label: `${value} ml`,
            }))}
          />
        </div>
        {cocktail.ingredients.some((item) => item.category === "Alcohol") && (
          <div className="control-block">
            <span className="control-step">2</span>
            <h2>Alcohol strength</h2>
            <SegmentedOptionGroup
              label="Alcohol strength"
              value={strength}
              onChange={setStrength}
              options={[
                { label: "Less", value: "less" },
                { label: "Standard", value: "standard" },
                { label: "More", value: "more" },
              ]}
            />
          </div>
        )}
        <div className="ingredients-preview">
          <h2>In your drink</h2>
          <div>
            {cocktail.ingredients.map((ingredient) => (
              <span key={ingredient.id}>
                <strong>{ingredient.name}</strong>
                <small>{ingredient.amount}</small>
              </span>
            ))}
          </div>
        </div>
        <div className="before-mixing">
          <h2>Before you start</h2>
          <p>
            {cocktail.manualItems.length
              ? `Add ${cocktail.manualItems.join(", ").toLowerCase()} to your glass.`
              : "Place your glass under the dispenser."}
          </p>
        </div>
        <button
          className="primary-button make-drink"
          disabled={busy || mutation.isPending || !cocktail.ingredients.length}
          onClick={() => mutation.mutate()}
          type="button"
        >
          <Play size={21} fill="currentColor" />
          {mutation.isPending
            ? "Starting…"
            : busy
              ? "Machine is busy"
              : "Make drink"}
        </button>
        {busy && (
          <p className="quiet-note">
            You can choose your drink while the current one is being made.
          </p>
        )}
      </section>
    </main>
  );
}
