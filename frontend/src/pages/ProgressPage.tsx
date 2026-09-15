import {
  CircleCheck,
  CirclePause,
  LoaderCircle,
  Square,
  TriangleAlert,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useDrinkSession } from "../state/useDrinkSession";
import { ProgressMeter } from "../components/ProgressMeter";
import { CocktailImage } from "../components/CocktailImage";
import { PageInfoButton } from "../components/PageInfoButton";

function ProgressPercentage({
  value,
  running,
}: {
  value: number;
  running: boolean;
}) {
  const current = useRef(value);
  const [percentage, setPercentage] = useState(value);

  useEffect(() => {
    if (!running || value <= current.current) {
      current.current = value;
      setPercentage(value);
      return;
    }

    const from = current.current;
    const startedAt = performance.now();
    let frame: number;
    const animate = (now: number) => {
      const fraction = Math.min(1, (now - startedAt) / 1000);
      current.current = from + (value - from) * fraction;
      setPercentage(Math.floor(current.current));
      if (fraction < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value, running]);

  return <strong>{percentage}%</strong>;
}

export function ProgressPage() {
  const { session, status, stop, stopping, resume, resuming } =
    useDrinkSession();
  const navigate = useNavigate();
  if (!session)
    return (
      <div className="empty-state">
        <div className="page-title-with-info">
          <h1>Choose something good.</h1>
          <PageInfoButton />
        </div>
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
  const finished = status?.state === "finished";
  const paused = status?.state === "paused";
  const after = session.cocktail.preparationSteps.filter(
    (step) => step.phase === "AFTER",
  );

  if (finished)
    return (
      <main className="completion-layout">
        <CocktailImage cocktail={session.cocktail} />
        <section>
          <span className="eyebrow">Ready to enjoy</span>
          <div className="page-title-with-info">
            <h1>Your {session.cocktail.name} is ready.</h1>
            <PageInfoButton />
          </div>
          {after.length > 0 && (
            <>
              <h2>One last touch</h2>
              <ul className="preparation-list">
                {after.map((step, index) => (
                  <li key={`${step.text}-${index}`}>
                    <CircleCheck size={20} />
                    {step.text}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button
            className="primary-button"
            type="button"
            onClick={() => navigate("/")}
          >
            Done
          </button>
        </section>
      </main>
    );

  return (
    <main className="progress-layout">
      <section className="progress-art">
        <CocktailImage cocktail={session.cocktail} />
      </section>
      <section className="progress-content">
        <span className="eyebrow">
          {paused ? "Paused safely" : "A moment, just for you"}
        </span>
        <div className="page-title-with-info">
          <h1>
            {paused ? "Your drink is paused" : "Making your"}
            {!paused && (
              <>
                <br />
                {session.cocktail.name}
              </>
            )}
          </h1>
          <PageInfoButton />
        </div>

        {paused ? (
          <div className="glass-pause-panel" role="alert">
            <TriangleAlert size={24} />
            <span>
              <strong>
                {status?.glassPresent
                  ? "Glass detected again"
                  : "Place the glass back"}
              </strong>
              <small>
                No liquid is dispensing. Neat will continue from the same
                point.
              </small>
            </span>
          </div>
        ) : (
          <p>All ingredients dispense together.</p>
        )}

        <div className="progress-caption">
          <span>{paused ? "Waiting for you" : "Dispensing"}</span>
          <ProgressPercentage
            value={progress}
            running={status?.state === "running"}
          />
        </div>
        <ProgressMeter value={progress} label="Drink preparation" />

        <div className="simultaneous-dispense" aria-label="Ingredients">
          {session.cocktail.ingredients.map((item) => (
            <span key={item.id}>
              {status?.completedIngredientIds?.includes(item.ingredientId) ? (
                <CircleCheck className="dispense-complete" size={19} />
              ) : paused ? (
                <CirclePause size={19} />
              ) : (
                <LoaderCircle className="dispense-spinner" size={19} />
              )}
              <strong>{item.name}</strong>
              <small>{item.amount}</small>
            </span>
          ))}
        </div>

        <div className="progress-actions">
          {paused ? (
            <button
              className="resume-button"
              disabled={resuming}
              onClick={() => void resume(!status?.glassPresent)}
              type="button"
            >
              {resuming
                ? "Resuming…"
                : status?.glassPresent
                  ? "Resume drink"
                  : "Continue without sensor"}
            </button>
          ) : (
            <button
              className="secondary-button"
              onClick={() => navigate("/")}
              type="button"
            >
              Browse cocktails
            </button>
          )}
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
