import type { Cocktail } from "../types/cocktail";
import { CocktailCard } from "./CocktailCard";

interface CocktailGridProps {
  cocktails: Cocktail[];
  selectedId?: number;
  onSelect: (cocktail: Cocktail) => void;
}

export function CocktailGrid({
  cocktails,
  selectedId,
  onSelect,
}: CocktailGridProps) {
  if (cocktails.length === 0) {
    return <div className="no-results">No cocktails match your search.</div>;
  }

  return (
    <div className="cocktail-grid">
      {cocktails.map((cocktail) => (
        <CocktailCard
          cocktail={cocktail}
          key={cocktail.id}
          onSelect={onSelect}
          selected={cocktail.id === selectedId}
        />
      ))}
    </div>
  );
}
