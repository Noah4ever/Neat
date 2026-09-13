import { useState } from "react";
import { Martini } from "lucide-react";
import type { Cocktail } from "../types/cocktail";
export function CocktailImage({
  cocktail,
  className = "",
}: {
  cocktail: Cocktail;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | undefined>();
  return (
    <div className={`cocktail-image ${className}`}>
      {cocktail.image && failed !== cocktail.image ? (
        <img
          src={cocktail.image}
          alt={cocktail.name}
          draggable={false}
          onError={() => setFailed(cocktail.image)}
        />
      ) : (
        <div
          className="image-placeholder"
          role="img"
          aria-label={`${cocktail.name}, no image`}
        >
          <Martini size={64} strokeWidth={1} />
        </div>
      )}
    </div>
  );
}
