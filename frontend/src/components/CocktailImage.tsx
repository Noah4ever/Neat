import { useState } from "react";
import { Martini } from "lucide-react";
import { cocktailImageFor } from "../data/cocktailImages";
import type { Cocktail } from "../types/cocktail";
export function CocktailImage({
  cocktail,
  className = "",
}: {
  cocktail: Cocktail;
  className?: string;
}) {
  const image = cocktailImageFor(cocktail.imageKey);
  const [failed, setFailed] = useState<string | undefined>();
  return (
    <div className={`cocktail-image ${className}`}>
      {image && failed !== image ? (
        <img
          src={image}
          alt={cocktail.name}
          draggable={false}
          onError={() => setFailed(image)}
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
