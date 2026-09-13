import { CircleCheck, Circle, Square } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDrinkSession } from "../state/useDrinkSession";
import { ProgressMeter } from "../components/ProgressMeter";
import { CocktailImage } from "../components/CocktailImage";
export function ProgressPage() {
  const { session, status, stop, stopping } = useDrinkSession();
  const navigate = useNavigate();
  if (!session)
    return (
      <div className="empty-state">
        <h1>Choose something good.</h1>
        <button
          className="primary-button"
          type="button"
          onClick={() => navigate("/")}
        >
          Browse cocktails
        </button>
      </div>
    );
  const progress = status?.progress ?? 0;
  const steps = [
    "Preparing",
    ...session.cocktail.ingredients.map((item) => `Dispensing ${item.name}`),
  ];
  const current = Math.min(
    steps.length - 1,
    Math.floor((progress / 100) * steps.length),
  );
  return (
    <main className="progress-layout">
      <section className="progress-art">
        <CocktailImage cocktail={session.cocktail} />
      </section>
      <section className="progress-content">
        <span className="eyebrow">A moment, just for you</span>
        <h1>
          Making your
          <br />
          {session.cocktail.name}
        </h1>
        <p>Please keep your glass in place.</p>
        <div className="progress-caption">
          <span>{steps[current]}</span>
          <strong>{progress}%</strong>
        </div>
        <ProgressMeter value={progress} label="Drink preparation" />
        <ol className="progress-steps">
          {steps.map((step, index) => (
            <li
              key={step}
              data-state={
                index < current
                  ? "complete"
                  : index === current
                    ? "current"
                    : "pending"
              }
              aria-current={index === current ? "step" : undefined}
            >
              {index < current ? (
                <CircleCheck size={24} />
              ) : (
                <Circle size={24} />
              )}
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="progress-actions">
          <button
            className="secondary-button"
            onClick={() => navigate("/")}
            type="button"
          >
            Browse cocktails
          </button>
          <button
            className="stop-button"
            disabled={stopping}
            onClick={() => void stop()}
            type="button"
          >
            <Square size={18} />
            {stopping ? "Stopping…" : "Stop"}
          </button>
        </div>
      </section>
    </main>
  );
}
