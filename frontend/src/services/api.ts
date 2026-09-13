import { mockCocktails } from "../data/mockCocktails";
import type { Cocktail, DrinkStrength } from "../types/cocktail";
import type {
  DeviceInfo,
  Ingredient,
  NetworkInfo,
  OperationStatus,
  PumpConfig,
  RecipeItem,
  RecipeRecord,
} from "../types/device";

export const USE_MOCK_API = true;

// Only this module knows the HTTP contracts. Mock changes last until page reload.
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
const copy = <T>(value: T): T => structuredClone(value);
let recipes = copy(mockCocktails);
let ingredients: Ingredient[] = Array.from(
  new Map(
    recipes
      .flatMap((recipe) => recipe.ingredients)
      .map((item) => [item.id, { id: item.id, name: item.name }]),
  ).values(),
);
let pumps: PumpConfig[] = [
  { id: 1, ingredientId: 1, mlPerSec: 3.2, output: { type: 0, channel: 4 } },
  { id: 2, ingredientId: 5, mlPerSec: 3.1, output: { type: 0, channel: 5 } },
  { id: 3, ingredientId: 7, mlPerSec: null, output: { type: 0, channel: 6 } },
];
let operation: OperationStatus = { state: "idle", progress: 0 };
let operationStarted = 0;
let operationDuration = 20000;
let calibration: { pumpId: number; durationMs: number } | null = null;
let network: NetworkInfo = {
  connected: true,
  ssid: "HomeWiFi",
  accessPoint: "Neat",
  address: "192.168.1.42",
  networks: [],
};
const nextId = (values: { id: number }[]) =>
  Math.max(0, ...values.map((value) => value.id)) + 1;

export function recipeItems(recipe: Cocktail): RecipeItem[] {
  const explicit = recipe.ingredients.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0,
  );
  const topUps = recipe.ingredients.filter(
    (item) => item.amount === "Top up",
  ).length;
  return recipe.ingredients.map((item) => ({
    ingredientId: item.id,
    amountMl: Math.round(
      item.amount === "Top up"
        ? Math.max(0, recipe.defaultSize - explicit) / topUps
        : parseFloat(item.amount) || 0,
    ),
  }));
}
export function drinkOverrides(
  recipe: Cocktail,
  sizeMl: number,
  strength: DrinkStrength,
): RecipeItem[] {
  const items = recipeItems(recipe);
  const weights = items.map(
    (item) =>
      item.amountMl *
      (recipe.ingredients.find(
        (ingredient) => ingredient.id === item.ingredientId,
      )?.category === "Alcohol"
        ? strength === "less"
          ? 0.7
          : strength === "more"
            ? 1.3
            : 1
        : 1),
  );
  const sum = weights.reduce((total, value) => total + value, 0);
  if (!sum) return [];
  let allocated = 0;
  return items.map((item, index) => {
    const amountMl =
      index === items.length - 1
        ? sizeMl - allocated
        : Math.floor((weights[index] / sum) * sizeMl);
    allocated += amountMl;
    return { ingredientId: item.ingredientId, amountMl };
  });
}
function normalize(record: RecipeRecord, names: Ingredient[]): Cocktail {
  return {
    id: record.id,
    name: record.name,
    subtitle: "",
    description: "",
    manualItems: [],
    availableSizes: [300, 400, 500],
    defaultSize: 400,
    defaultStrength: "standard",
    ingredients: record.items.map((item) => ({
      id: item.ingredientId,
      name:
        names.find((ingredient) => ingredient.id === item.ingredientId)?.name ??
        `Ingredient ${item.ingredientId}`,
      amount: `${item.amountMl} ml`,
      category: "Mixer",
    })),
  };
}
export async function getRecipes(): Promise<Cocktail[]> {
  if (USE_MOCK_API) return copy(recipes);
  const [records, names] = await Promise.all([
    request<RecipeRecord[]>("/api/recipes"),
    getIngredients(),
  ]);
  return records.map((record) => normalize(record, names));
}
export async function getRecipe(id: number) {
  if (USE_MOCK_API) {
    const value = recipes.find((recipe) => recipe.id === id);
    if (!value) throw new Error("Recipe not found");
    return copy(value);
  }
  const [record, names] = await Promise.all([
    request<RecipeRecord>(`/api/recipes/${id}`),
    getIngredients(),
  ]);
  return normalize(record, names);
}
export async function saveRecipe(recipe: Cocktail, isNew: boolean) {
  if (USE_MOCK_API) {
    const saved = { ...copy(recipe), id: isNew ? nextId(recipes) : recipe.id };
    recipes = isNew
      ? [...recipes, saved]
      : recipes.map((item) => (item.id === saved.id ? saved : item));
    return saved;
  }
  const body = { name: recipe.name, items: recipeItems(recipe) };
  await request(
    isNew ? "/api/recipes" : `/api/recipes/${recipe.id}`,
    isNew ? "POST" : "PUT",
    body,
  );
  return recipe;
}
export async function deleteRecipe(id: number) {
  if (USE_MOCK_API) {
    recipes = recipes.filter((recipe) => recipe.id !== id);
    return;
  }
  await request(`/api/recipes/${id}`, "DELETE");
}
export async function getIngredients(): Promise<Ingredient[]> {
  return USE_MOCK_API ? copy(ingredients) : request("/api/ingredients");
}
export async function saveIngredient(value: Ingredient, isNew: boolean) {
  if (USE_MOCK_API) {
    const saved = { ...value, id: isNew ? nextId(ingredients) : value.id };
    ingredients = isNew
      ? [...ingredients, saved]
      : ingredients.map((item) => (item.id === saved.id ? saved : item));
    recipes = recipes.map((recipe) => ({
      ...recipe,
      ingredients: recipe.ingredients.map((item) =>
        item.id === saved.id ? { ...item, name: saved.name } : item,
      ),
    }));
    return;
  }
  await request(
    isNew ? "/api/ingredients" : `/api/ingredients/${value.id}`,
    isNew ? "POST" : "PUT",
    { name: value.name },
  );
}
export async function deleteIngredient(id: number) {
  if (USE_MOCK_API) {
    if (
      recipes.some((recipe) =>
        recipe.ingredients.some((item) => item.id === id),
      ) ||
      pumps.some((pump) => pump.ingredientId === id)
    )
      throw new Error("This ingredient is still assigned to a recipe or pump.");
    ingredients = ingredients.filter((item) => item.id !== id);
    return;
  }
  await request(`/api/ingredients/${id}`, "DELETE");
}
export async function getPumps(): Promise<PumpConfig[]> {
  return USE_MOCK_API ? copy(pumps) : request("/api/pumps");
}
export async function savePump(value: PumpConfig, isNew: boolean) {
  if (USE_MOCK_API) {
    if (isNew && pumps.some((pump) => pump.id === value.id))
      throw new Error("This pump ID already exists.");
    pumps = isNew
      ? [...pumps, copy(value)]
      : pumps.map((pump) => (pump.id === value.id ? copy(value) : pump));
    return;
  }
  await request(
    isNew ? "/api/pumps" : `/api/pumps/${value.id}`,
    isNew ? "POST" : "PUT",
    value,
  );
}
export async function assignPump(id: number, ingredientId: number | null) {
  if (USE_MOCK_API) {
    pumps = pumps.map((pump) =>
      pump.id === id ? { ...pump, ingredientId } : pump,
    );
    return;
  }
  await request(`/api/pumps/${id}/ingredient`, "PUT", { ingredientId });
}
export async function deletePump(id: number) {
  if (USE_MOCK_API) {
    pumps = pumps.filter((pump) => pump.id !== id);
    return;
  }
  await request(`/api/pumps/${id}`, "DELETE");
}
function begin(
  kind: "drink" | "cleaning" | "calibration",
  label: string,
  duration: number,
  recipeId?: number,
) {
  refreshOperation();
  if (
    operation.state === "running" ||
    (operation.kind === "calibration" && operation.state === "finished")
  )
    throw new Error("Please stop or finish the current operation first.");
  operation = { state: "running", progress: 0, kind, label, recipeId };
  operationStarted = Date.now();
  operationDuration = duration;
}
function refreshOperation() {
  if (operation.state !== "running") return;
  operation.progress = Math.min(
    100,
    Math.floor(((Date.now() - operationStarted) / operationDuration) * 100),
  );
  if (operation.progress === 100) operation.state = "finished";
}
export interface MakeDrinkRequest {
  recipeId: number;
  overrides: RecipeItem[];
}
export async function makeDrink(value: MakeDrinkRequest) {
  if (USE_MOCK_API) {
    begin(
      "drink",
      recipes.find((recipe) => recipe.id === value.recipeId)?.name ??
        "Cocktail",
      20000,
      value.recipeId,
    );
    return;
  }
  await request(`/api/recipes/${value.recipeId}/start`, "POST", {
    overrides: value.overrides,
  });
}
export async function getStatus(): Promise<OperationStatus> {
  if (USE_MOCK_API) {
    refreshOperation();
    return copy(operation);
  }
  return request("/api/status");
}
export async function stopOperation() {
  if (USE_MOCK_API) {
    operation = { ...operation, state: "stopped" };
    calibration = null;
    return;
  }
  await request("/api/operation/stop", "POST");
}
export async function startCleaning(pumpId?: number) {
  if (USE_MOCK_API) {
    begin(
      "cleaning",
      pumpId === undefined ? "Rinsing all pumps" : `Rinsing pump ${pumpId}`,
      15000,
    );
    return;
  }
  await request(
    pumpId === undefined
      ? "/api/cleaning/start"
      : `/api/cleaning/pumps/${pumpId}/start`,
    "POST",
  );
}
export async function startCalibration(pumpId: number, durationMs: number) {
  if (USE_MOCK_API) {
    begin("calibration", `Calibrating pump ${pumpId}`, durationMs);
    calibration = { pumpId, durationMs };
    return;
  }
  await request("/api/calibration/start", "POST", { pumpId, durationMs });
}
export async function finishCalibration(measuredMl: number) {
  if (USE_MOCK_API) {
    refreshOperation();
    if (
      !calibration ||
      operation.kind !== "calibration" ||
      operation.state !== "finished"
    )
      throw new Error(
        "Finish the calibration run before entering the measured volume.",
      );
    const rate = measuredMl / (calibration.durationMs / 1000);
    pumps = pumps.map((pump) =>
      pump.id === calibration?.pumpId ? { ...pump, mlPerSec: rate } : pump,
    );
    calibration = null;
    operation = { state: "idle", progress: 0 };
    return;
  }
  await request("/api/calibration/finish", "POST", { measuredMl });
}
export async function getNetwork(): Promise<NetworkInfo> {
  return USE_MOCK_API ? copy(network) : request("/api/network/status");
}
export async function scanNetworks() {
  if (USE_MOCK_API) {
    network = {
      ...network,
      networks: [
        { ssid: "HomeWiFi", secured: true, rssi: -38 },
        { ssid: "Neat_Guest", secured: true, rssi: -55 },
        { ssid: "Office", secured: true, rssi: -66 },
        { ssid: "CafeNet", secured: false, rssi: -76 },
      ],
    };
    return;
  }
  await request("/api/network/scan", "POST");
}
export async function connectNetwork(ssid: string, password: string) {
  if (USE_MOCK_API) {
    network = { ...network, connected: true, ssid };
    return;
  }
  await request("/api/network/connect", "POST", { ssid, password });
}
export async function getDevice(): Promise<DeviceInfo> {
  return USE_MOCK_API
    ? { name: "Neat", model: "ESP32-C6", version: "1.0.0" }
    : request("/api/device");
}
export async function getHealth() {
  return USE_MOCK_API
    ? { status: "ok" }
    : request<{ status: string }>("/api/health");
}
export async function restartDevice() {
  if (!USE_MOCK_API) await request("/api/device/restart", "POST");
}
