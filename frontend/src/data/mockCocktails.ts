import type { Cocktail } from "../types/cocktail";

const sizes = [300, 400, 500];

const ingredient = (
  id: number,
  name: string,
  amount: string,
  category: "Alcohol" | "Juice" | "Mixer" | "Syrup",
) => ({ id, name, amount, category });

export const mockCocktails: Cocktail[] = [
  {
    id: 1,
    name: "Mojito",
    imageKey: "mojito",
    subtitle: "Fresh. Crisp. Timeless.",
    description:
      "White rum, fresh lime and mint finished with a bright splash of soda.",
    manualItems: ["Ice cubes", "Lime wedges", "Mint leaves"],
    availableSizes: sizes,
    defaultSize: 400,
    defaultStrength: "standard",
    ingredients: [
      ingredient(1, "White Rum", "50 ml", "Alcohol"),
      ingredient(5, "Lime Juice", "25 ml", "Juice"),
      ingredient(7, "Sugar Syrup", "15 ml", "Syrup"),
      ingredient(8, "Soda Water", "Top up", "Mixer"),
    ],
  },
  {
    id: 2,
    name: "Whiskey Sour",
    imageKey: "whiskey-sour",
    subtitle: "Whiskey & lemon. No egg white.",
    description: "Whiskey, fresh lemon and a little sweetness. No egg white.",
    manualItems: ["Ice cubes", "Orange peel", "Cherry"],
    availableSizes: sizes,
    defaultSize: 300,
    defaultStrength: "standard",
    ingredients: [
      ingredient(9, "Whiskey", "50 ml", "Alcohol"),
      ingredient(10, "Lemon Juice", "30 ml", "Juice"),
      ingredient(7, "Sugar Syrup", "15 ml", "Syrup"),
    ],
  },
  {
    id: 3,
    name: "Caipirinha",
    imageKey: "caipirinha",
    subtitle: "Brazilian. Zesty. Vibrant.",
    description:
      "A lively mix of cachaça and fresh lime with a clean, punchy finish.",
    manualItems: ["Crushed ice", "Lime wedges"],
    availableSizes: sizes,
    defaultSize: 300,
    defaultStrength: "standard",
    ingredients: [
      ingredient(11, "Cachaça", "50 ml", "Alcohol"),
      ingredient(5, "Lime Juice", "35 ml", "Juice"),
      ingredient(7, "Sugar Syrup", "15 ml", "Syrup"),
    ],
  },
  {
    id: 4,
    name: "Sex on the Beach",
    imageKey: "sex-on-the-beach",
    subtitle: "Fruity. Fun. Iconic.",
    description:
      "A bright, fruit-forward combination with peach, orange and cranberry.",
    manualItems: ["Ice cubes", "Orange slice"],
    availableSizes: sizes,
    defaultSize: 400,
    defaultStrength: "standard",
    ingredients: [
      ingredient(2, "Vodka", "40 ml", "Alcohol"),
      ingredient(12, "Peach Liqueur", "20 ml", "Alcohol"),
      ingredient(6, "Orange Juice", "80 ml", "Juice"),
      ingredient(13, "Cranberry Juice", "80 ml", "Juice"),
    ],
  },
  {
    id: 5,
    name: "Long Island Iced Tea",
    imageKey: "long-island",
    subtitle: "Strong. Bold. Legendary.",
    description:
      "A full-flavored classic with citrus, cola and a confident spirit blend.",
    manualItems: ["Ice cubes", "Lemon wedge"],
    availableSizes: sizes,
    defaultSize: 400,
    defaultStrength: "standard",
    ingredients: [
      ingredient(2, "Vodka", "15 ml", "Alcohol"),
      ingredient(3, "Gin", "15 ml", "Alcohol"),
      ingredient(1, "White Rum", "15 ml", "Alcohol"),
      ingredient(4, "Tequila", "15 ml", "Alcohol"),
      ingredient(16, "Orange Liqueur", "15 ml", "Alcohol"),
      ingredient(10, "Lemon Juice", "25 ml", "Juice"),
      ingredient(7, "Sugar Syrup", "15 ml", "Syrup"),
      ingredient(14, "Cola", "Top up", "Mixer"),
    ],
  },
  {
    id: 6,
    name: "Gin Tonic",
    imageKey: "gin-tonic",
    subtitle: "Crisp. Refreshing. Modern.",
    description:
      "A clean and refreshing highball with botanical gin and sparkling tonic.",
    manualItems: ["Ice cubes", "Lime wheel"],
    availableSizes: sizes,
    defaultSize: 400,
    defaultStrength: "standard",
    ingredients: [
      ingredient(3, "Gin", "50 ml", "Alcohol"),
      ingredient(15, "Tonic Water", "Top up", "Mixer"),
    ],
  },
  {
    id: 7,
    name: "Margarita",
    imageKey: "margarita",
    subtitle: "Zesty. Smooth. Classic.",
    description:
      "Tequila and orange meet fresh lime in a sharp, balanced favorite.",
    manualItems: ["Salt rim", "Ice cubes", "Lime wheel"],
    availableSizes: sizes,
    defaultSize: 300,
    defaultStrength: "standard",
    ingredients: [
      ingredient(4, "Tequila", "50 ml", "Alcohol"),
      ingredient(16, "Orange Liqueur", "25 ml", "Alcohol"),
      ingredient(5, "Lime Juice", "25 ml", "Juice"),
    ],
  },
  {
    id: 8,
    name: "Piña Colada",
    imageKey: "pina-colada",
    subtitle: "Tropical. Creamy. Dreamy.",
    description:
      "Creamy coconut, pineapple and rum blended into a smooth tropical escape.",
    manualItems: ["Ice cubes", "Pineapple slice"],
    availableSizes: sizes,
    defaultSize: 400,
    defaultStrength: "standard",
    ingredients: [
      ingredient(1, "White Rum", "50 ml", "Alcohol"),
      ingredient(17, "Pineapple Juice", "90 ml", "Juice"),
      ingredient(18, "Coconut Cream", "40 ml", "Mixer"),
    ],
  },
  {
    id: 9,
    name: "Negroni",
    imageKey: "negroni",
    subtitle: "Bitter. Balanced. Refined.",
    description:
      "Equal parts bitter, sweet and botanical for a rich, sophisticated sip.",
    manualItems: ["Large ice cube", "Orange peel"],
    availableSizes: sizes,
    defaultSize: 300,
    defaultStrength: "standard",
    ingredients: [
      ingredient(3, "Gin", "30 ml", "Alcohol"),
      ingredient(19, "Bitter Aperitif", "30 ml", "Alcohol"),
      ingredient(20, "Sweet Vermouth", "30 ml", "Alcohol"),
    ],
  },
];

mockCocktails.push(
  {
    id: 10,
    name: "Moscow Mule",
    imageKey: "moscow-mule",
    subtitle: "Ginger. Lime. A little kick.",
    description: "Vodka, bright lime and spicy ginger beer, served ice cold.",
    manualItems: ["Ice cubes", "Lime wedge"],
    availableSizes: sizes,
    defaultSize: 400,
    defaultStrength: "standard",
    ingredients: [
      ingredient(2, "Vodka", "50 ml", "Alcohol"),
      ingredient(5, "Lime Juice", "20 ml", "Juice"),
      ingredient(21, "Ginger Beer", "Top up", "Mixer"),
    ],
  },
  {
    id: 11,
    name: "Erdbeer Mojito",
    imageKey: "strawberry-mojito",
    subtitle: "Strawberry. Lime. Fresh mint.",
    description:
      "White rum, strawberries and lime with fresh mint and a splash of soda.",
    manualItems: ["Ice cubes", "Mint leaves", "Strawberries"],
    availableSizes: sizes,
    defaultSize: 400,
    defaultStrength: "standard",
    ingredients: [
      ingredient(1, "White Rum", "50 ml", "Alcohol"),
      ingredient(5, "Lime Juice", "25 ml", "Juice"),
      ingredient(22, "Strawberry Syrup", "30 ml", "Syrup"),
      ingredient(8, "Soda Water", "Top up", "Mixer"),
    ],
  },
);
const displayOrder = [3, 1, 5, 4, 2, 10, 11, 6, 7, 8, 9];
mockCocktails.sort(
  (a, b) => displayOrder.indexOf(a.id) - displayOrder.indexOf(b.id),
);
