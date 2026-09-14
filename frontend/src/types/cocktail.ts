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
  imageKey: string | null;
  subtitle: string;
  description: string;
  manualItems: string[];
  availableSizes: number[];
  defaultSize: number;
  defaultStrength: DrinkStrength;
  ingredients: CocktailIngredient[];
}
