export type DrinkStrength = "less" | "standard" | "more";

export interface CocktailIngredient {
  id: number;
  name: string;
  amount: string;
  category: "Alcohol" | "Juice" | "Mixer" | "Syrup";
}

export interface Cocktail {
  id: number;
  name: string;
  subtitle: string;
  description: string;
  image?: string;
  manualItems: string[];
  availableSizes: number[];
  defaultSize: number;
  defaultStrength: DrinkStrength;
  ingredients: CocktailIngredient[];
}
