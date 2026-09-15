export const cocktailImages: Record<string, string> = {
  mojito: "/drinks/mojito.webp",
  "whiskey-sour": "/drinks/whiskey-sour.webp",
  caipirinha: "/drinks/caipirinha.webp",
  "sex-on-the-beach": "/drinks/sex-on-the-beach.webp",
  "long-island": "/drinks/long-island.webp",
  "gin-tonic": "/drinks/gin-tonic.webp",
  margarita: "/drinks/margarita.webp",
  "pina-colada": "/drinks/pina-colada.webp",
  negroni: "/drinks/negroni.webp",
  "moscow-mule": "/drinks/moscow-mule.webp",
  "strawberry-mojito": "/drinks/strawberry-mojito.webp",
};

import { getMockMedia } from "../services/mockMedia";

export function cocktailImageFor(imageKey: string | null | undefined) {
  if (!imageKey) return undefined;
  if (imageKey.startsWith("media:")) {
    const id = imageKey.slice(6);
    return getMockMedia(id) ?? `/api/media/images/${id}`;
  }
  return cocktailImages[imageKey];
}
