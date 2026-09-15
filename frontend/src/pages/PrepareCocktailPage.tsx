import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { CocktailImage } from "../components/CocktailImage";
import { PageInfoButton } from "../components/PageInfoButton";
import { QueryMessage } from "../components/QueryMessage";
import { SegmentedOptionGroup } from "../components/SegmentedOptionGroup";
import { getDeviceSettings, getRecipe } from "../services/api";
import { showApiErrorWithRetry } from "../services/notifications";
import { ApiError } from "../services/errors";
import { useDrinkSession } from "../state/useDrinkSession";
import type { Cocktail, DrinkStrength } from "../types/cocktail";
import type { DeviceSettings } from "../types/device";

export function PrepareCocktailPage() {
  const { id } = useParams();
  const recipe = useQuery({
    queryKey: ["recipe", id],
    queryFn: () => getRecipe(Number(id)),
  });
  const settings = useQuery({
    queryKey: ["device-settings"],
    queryFn: getDeviceSettings,
  });
  if (!recipe.data) return <QueryMessage query={recipe} />;
  if (!settings.data) return <QueryMessage query={settings} />;
  return (
    <Preparation
      key={`${recipe.data.id}-${settings.data.defaultDrinkSizeMl}`}
      cocktail={recipe.data}
      settings={settings.data}
    />
  );
}

function Preparation({
  cocktail,
  settings,
}: {
  cocktail: Cocktail;
  settings: DeviceSettings;
}) {
  const [size, setSize] = useState(settings.defaultDrinkSizeMl);
  const [strength, setStrength] = useState<DrinkStrength>("standard");
  const [allowWithoutGlass, setAllowWithoutGlass] = useState(false);
  const { start, busy } = useDrinkSession();
  const navigate = useNavigate();
  const before = cocktail.preparationSteps.filter(
    (step) => step.phase === "BEFORE",
  );
  const mutation = useMutation<void, Error, boolean>({
    mutationFn: (ignoreGlass) =>
      start(cocktail, {
        recipeId: cocktail.id,
        sizeMl: size,
        strength,
        overrides: [],
        ignoreGlass,
      }),
    onSuccess: () => navigate("/progress"),
    onError: (error) => {
      if (error instanceof ApiError && error.key === "no_glass") {
        setAllowWithoutGlass(true);
      }
      showApiErrorWithRetry(error, () => mutation.mutate(false));
    },
  });
  return (
    <main className="prepare-layout">
      <section className="prepare-art">
        <CocktailImage cocktail={cocktail} className="prepare-image" />
        <span>{cocktail.subtitle}</span>
      </section>
      <section className="prepare-details">
        <div className="prepare-title">
          <div className="page-title-with-info">
            <h1>{cocktail.name}</h1>
            <PageInfoButton />
          </div>
          <p>{cocktail.description || "Made fresh, just for you."}</p>
        </div>
        <div className="control-block">
          <span className="control-step">1</span>
          <h2>Drink size</h2>
          <SegmentedOptionGroup
            label="Drink size"
            value={size}
            onChange={setSize}
            options={settings.drinkSizesMl.map((value) => ({
              value,
              label: `${value} ml`,
            }))}
          />
        </div>
        {cocktail.ingredients.some((item) => item.category === "ALCOHOL") && (
          <div className="control-block">
            <span className="control-step">2</span>
            <h2>Alcohol strength</h2>
            <SegmentedOptionGroup
              label="Alcohol strength"
              value={strength}
              onChange={setStrength}
              options={[
                {
                  label: "Less",
                  value: "less",
                  disabled: !cocktail.strengthAdjustmentAvailable,
                },
                { label: "Standard", value: "standard" },
                {
                  label: "More",
                  value: "more",
                  disabled: !cocktail.strengthAdjustmentAvailable,
                },
              ]}
            />
            {!cocktail.strengthAdjustmentAvailable && (
              <p className="quiet-note">
                This recipe keeps its original strength.
              </p>
            )}
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
        {before.length > 0 && (
          <div className="before-mixing mixing-preparation">
            <div className="mixing-preparation__heading">
              <h2>Before mixing</h2>
              <small>Add these to your glass, then make your drink.</small>
            </div>
            <ul className="preparation-list">
              {before.map((step, index) => (
                <li key={`${step.text}-${index}`}>{step.text}</li>
              ))}
            </ul>
          </div>
        )}
        <button
          className="primary-button make-drink"
          disabled={
            busy ||
            mutation.isPending ||
            !cocktail.availability.available ||
            !cocktail.ingredients.length
          }
          onClick={() => mutation.mutate(allowWithoutGlass)}
          type="button"
        >
          <Play size={21} fill="currentColor" />
          {mutation.isPending
            ? "Starting…"
            : busy
              ? "Machine is busy"
              : allowWithoutGlass
                ? "Start without glass sensor"
                : "Make drink"}
        </button>
        {allowWithoutGlass && (
          <p className="sensor-override-note">
            No glass was detected. Continuing will temporarily ignore the
            sensor for this drink.
          </p>
        )}
      </section>
    </main>
  );
}
