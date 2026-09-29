export interface CatalogRecipe {
  id: string;
  machineRecipeId: number;
  name: string;
  subtitle: string;
  description: string;
  imageKey: string;
  ingredients: string[];
  ingredientAmounts: { name: string; amountMl: number; packageMl: number; category: "alcohol" | "mixer"; machineDispensed: boolean }[];
  preparation: string[];
}

const alcohol = new Set(["Cachaça", "White rum", "Vodka", "Gin", "Tequila", "Orange liqueur", "Peach liqueur", "Whiskey", "Bitter aperitif", "Sweet vermouth"]);
const manual = new Set(["Soda water", "Cola", "Tonic water", "Ginger beer"]);
const amounts = (...items: [string, number, number?][]) =>
  items.map(([name, amountMl, packageMl = 700]) => ({ name, amountMl, packageMl, category: alcohol.has(name) ? "alcohol" as const : "mixer" as const, machineDispensed: !manual.has(name) }));

export const catalog: CatalogRecipe[] = [
  { id: "caipirinha", machineRecipeId: 3, name: "Caipirinha", subtitle: "Brazilian. Zesty. Vibrant.", description: "Cachaça, lime and a clean, punchy finish.", imageKey: "caipirinha", ingredients: ["Cachaça", "Lime juice", "Sugar syrup"], ingredientAmounts: amounts(["Cachaça",50],["Lime juice",35,1000],["Sugar syrup",15,700]), preparation: ["Crushed ice", "Lime wedges"] },
  { id: "mojito", machineRecipeId: 1, name: "Mojito", subtitle: "Fresh. Crisp. Timeless.", description: "White rum, lime and mint finished with soda.", imageKey: "mojito", ingredients: ["White rum", "Lime juice", "Sugar syrup", "Soda water"], ingredientAmounts: amounts(["White rum",50],["Lime juice",25,1000],["Sugar syrup",15,700],["Soda water",310,1000]), preparation: ["Ice cubes", "Lime wedges", "Mint leaves"] },
  { id: "long-island", machineRecipeId: 5, name: "Long Island Iced Tea", subtitle: "Strong. Bold. Legendary.", description: "A citrus and cola classic with a confident spirit blend.", imageKey: "long-island", ingredients: ["Vodka", "Gin", "White rum", "Tequila", "Orange liqueur", "Lemon juice", "Sugar syrup", "Cola"], ingredientAmounts: amounts(["Vodka",15],["Gin",15],["White rum",15],["Tequila",15],["Orange liqueur",15],["Lemon juice",25,1000],["Sugar syrup",15,700],["Cola",285,1000]), preparation: ["Ice cubes", "Lemon wedge"] },
  { id: "sex-on-the-beach", machineRecipeId: 4, name: "Sex on the Beach", subtitle: "Fruity. Bright. Iconic.", description: "Vodka, peach, orange and cranberry in a bright long drink.", imageKey: "sex-on-the-beach", ingredients: ["Vodka", "Peach liqueur", "Orange juice", "Cranberry juice"], ingredientAmounts: amounts(["Vodka",40],["Peach liqueur",20],["Orange juice",170,1000],["Cranberry juice",170,1000]), preparation: ["Ice cubes", "Orange slice"] },
  { id: "whiskey-sour", machineRecipeId: 2, name: "Whiskey Sour", subtitle: "Whiskey & lemon. No egg white.", description: "Whiskey, fresh lemon and sweetness. Made without egg white.", imageKey: "whiskey-sour", ingredients: ["Whiskey", "Lemon juice", "Sugar syrup"], ingredientAmounts: amounts(["Whiskey",50],["Lemon juice",30,1000],["Sugar syrup",15,700]), preparation: ["Ice cubes", "Orange peel"] },
  { id: "moscow-mule", machineRecipeId: 10, name: "Moscow Mule", subtitle: "Ginger. Lime. A little kick.", description: "Vodka, lime and spicy ginger beer, served ice cold.", imageKey: "moscow-mule", ingredients: ["Vodka", "Lime juice", "Ginger beer"], ingredientAmounts: amounts(["Vodka",50],["Lime juice",20,1000],["Ginger beer",330,1000]), preparation: ["Ice cubes", "Lime wedge"] },
  { id: "strawberry-mojito", machineRecipeId: 11, name: "Erdbeer Mojito", subtitle: "Strawberry. Lime. Fresh mint.", description: "White rum, strawberry and lime with mint and soda.", imageKey: "strawberry-mojito", ingredients: ["White rum", "Lime juice", "Strawberry syrup", "Soda water"], ingredientAmounts: amounts(["White rum",50],["Lime juice",25,1000],["Strawberry syrup",30,700],["Soda water",295,1000]), preparation: ["Ice cubes", "Mint leaves", "Strawberries"] },
  { id: "gin-tonic", machineRecipeId: 6, name: "Gin Tonic", subtitle: "Crisp. Botanical. Refreshing.", description: "Gin and sparkling tonic in a clean highball.", imageKey: "gin-tonic", ingredients: ["Gin", "Tonic water"], ingredientAmounts: amounts(["Gin",50],["Tonic water",350,1000]), preparation: ["Ice cubes", "Lime wheel"] },
  { id: "margarita", machineRecipeId: 7, name: "Margarita", subtitle: "Zesty. Smooth. Classic.", description: "Tequila, orange liqueur and fresh lime.", imageKey: "margarita", ingredients: ["Tequila", "Orange liqueur", "Lime juice"], ingredientAmounts: amounts(["Tequila",50],["Orange liqueur",25],["Lime juice",25,1000]), preparation: ["Salt rim", "Ice cubes"] },
  { id: "pina-colada", machineRecipeId: 8, name: "Piña Colada", subtitle: "Tropical. Creamy. Smooth.", description: "Coconut, pineapple and rum in a tropical classic.", imageKey: "pina-colada", ingredients: ["White rum", "Pineapple juice", "Coconut cream"], ingredientAmounts: amounts(["White rum",50],["Pineapple juice",90,1000],["Coconut cream",40,500]), preparation: ["Ice cubes", "Pineapple slice"] },
  { id: "negroni", machineRecipeId: 9, name: "Negroni", subtitle: "Bitter. Balanced. Refined.", description: "Equal parts bitter, sweet and botanical.", imageKey: "negroni", ingredients: ["Gin", "Bitter aperitif", "Sweet vermouth"], ingredientAmounts: amounts(["Gin",30],["Bitter aperitif",30],["Sweet vermouth",30]), preparation: ["Large ice cube", "Orange peel"] }
];
