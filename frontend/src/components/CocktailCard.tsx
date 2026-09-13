import type { Cocktail } from "../types/cocktail";
import { CocktailImage } from "./CocktailImage";

interface CocktailCardProps {
  cocktail: Cocktail;
  selected: boolean;
  onSelect: (cocktail: Cocktail) => void;
}

export function CocktailCard({
  cocktail,
  selected,
  onSelect,
}: CocktailCardProps) {
  return (
    <button
      aria-pressed={selected}
      className="cocktail-card"
      onClick={() => onSelect(cocktail)}
      type="button"
    >
      <CocktailImage cocktail={cocktail} />
      <span className="cocktail-card__copy">
        <strong>{cocktail.name}</strong>
        <small>{cocktail.subtitle}</small>
      </span>
    </button>
  );
}
