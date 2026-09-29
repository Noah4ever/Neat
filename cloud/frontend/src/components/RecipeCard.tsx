import { Check } from "lucide-react";
import type { Recipe } from "../types";

export function RecipeCard({ recipe, selected, onClick }: { recipe: Recipe; selected?: boolean; onClick: () => void }) {
  return <button className={`recipe-card ${selected ? "selected" : ""}`} disabled={!recipe.available} onClick={onClick} type="button">
    <div className="recipe-image"><img alt="" src={recipe.imageUrl || `/drinks/${recipe.imageKey}.webp`} /></div>
    <div><strong>{recipe.name}</strong><span>{recipe.subtitle}</span></div>
    {selected && <span className="selection-mark"><Check size={15} /></span>}
    {!recipe.available && <small>Not available</small>}
  </button>;
}
