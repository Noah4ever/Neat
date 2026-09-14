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

export function cocktailImageFor(imageKey: string | null | undefined) {
  return imageKey ? cocktailImages[imageKey] : undefined;
}
