import type {
  IngredientCategory,
  PreparationStep,
  RecipeAvailability,
  RecipeItem,
} from "./device";

export type DrinkStrength = "less" | "standard" | "more";
export interface CocktailIngredient extends RecipeItem {
  id: number;
  name: string;
  category: IngredientCategory;
  amount: string;
}
export interface Cocktail {
  id: number;
  name: string;
  imageKey: string | null;
  subtitle: string;
  description: string;
  baseSizeMl: number;
  preparationSteps: PreparationStep[];
  availability: RecipeAvailability;
  strengthAdjustmentAvailable: boolean;
  ingredients: CocktailIngredient[];
}
