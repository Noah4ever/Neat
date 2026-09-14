import { mockCocktails } from "../data/mockCocktails";
import type { Cocktail, DrinkStrength } from "../types/cocktail";
import type {
  BottleState,
  DeviceInfo,
  DeviceSettings,
  Ingredient,
  NetworkInfo,
  OperationStatus,
  PumpConfig,
  RecipeItem,
  RecipeRecord,
} from "../types/device";
import { ApiError } from "./errors";
import { emitMockMachineEvent } from "./mockEvents";

const mockSetting = import.meta.env.VITE_USE_MOCK_API;
export const USE_MOCK_API =
  mockSetting === "true" || (mockSetting === undefined && import.meta.env.DEV);

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
type MockScenario =
  | "no_glass"
  | "glass_removed"
  | "pump_not_calibrated"
  | "ingredient_not_available"
  | "bottle_may_be_empty";

const copy = <T>(value: T): T => structuredClone(value);
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

function toRecipeRecord(recipe: Cocktail): RecipeRecord {
  return {
    id: recipe.id,
    name: recipe.name,
    imageKey: recipe.imageKey,
    items: recipeItems(recipe),
  };
}

let mockRecipes = mockCocktails.map(toRecipeRecord);
let mockIngredients: Ingredient[] = Array.from(
  new Map(
    mockCocktails
      .flatMap((recipe) => recipe.ingredients)
      .map((item) => [item.id, { id: item.id, name: item.name }]),
  ).values(),
);
let mockPumps: PumpConfig[] = [
  { id: 1, ingredientId: 1, mlPerSec: 3.2, output: { type: 0, channel: 4 } },
  { id: 2, ingredientId: 5, mlPerSec: 3.1, output: { type: 0, channel: 5 } },
  { id: 3, ingredientId: 7, mlPerSec: 2.8, output: { type: 0, channel: 6 } },
  { id: 4, ingredientId: 8, mlPerSec: 8.5, output: { type: 0, channel: 7 } },
  { id: 5, ingredientId: 2, mlPerSec: 3.3, output: { type: 0, channel: 8 } },
  { id: 6, ingredientId: 9, mlPerSec: 3.0, output: { type: 0, channel: 9 } },
];
let mockBottles: BottleState[] = mockPumps.map((pump) => ({
  pumpId: pump.id,
  capacityMl: 700,
  remainingMl: pump.id === 2 ? 420 : 700,
}));
let mockDeviceSettings: DeviceSettings = {
  activateLedWhenPumpActive: true,
};
let mockOperation: OperationStatus = { state: "idle", progress: 0 };
let mockOperationStarted = 0;
let mockOperationDuration = 4_000;
let mockCalibration: { pumpId: number; durationMs: number } | null = null;
let mockDrinkConsumption: { pumpId: number; amountMl: number }[] = [];
let mockGlassRemovalSent = false;
let mockNetwork: NetworkInfo = {
  connected: true,
  ssid: "HomeWiFi",
  accessPoint: "Neat",
  address: "192.168.1.42",
  networks: [],
};

function mockScenario(): MockScenario | null {
  // Development simulation: use ?mockScenario=no_glass (or store the same
  // value in localStorage under neat.mockScenario). Remove it to reset.
  const fromUrl = new URLSearchParams(window.location.search).get(
    "mockScenario",
  );
  const value = fromUrl ?? localStorage.getItem("neat.mockScenario");
  return [
    "no_glass",
    "glass_removed",
    "pump_not_calibrated",
    "ingredient_not_available",
    "bottle_may_be_empty",
  ].includes(value ?? "")
    ? (value as MockScenario)
    : null;
}

function mockError(status: number, key: string): never {
  throw new ApiError(status, key);
}

function refreshMockOperation() {
  if (mockOperation.state !== "running") return;
  const elapsed = Date.now() - mockOperationStarted;
  if (
    mockOperation.kind === "drink" &&
    mockScenario() === "glass_removed" &&
    elapsed >= 600 &&
    !mockGlassRemovalSent
  ) {
    mockGlassRemovalSent = true;
    mockOperation = { ...mockOperation, state: "stopped", progress: 0 };
    mockDrinkConsumption = [];
    emitMockMachineEvent({ type: "machine_error", error: "glass_removed" });
    return;
  }

  mockOperation.progress = Math.min(
    100,
    Math.floor((elapsed / mockOperationDuration) * 100),
  );
  if (mockOperation.progress < 100) return;

  mockOperation.state = "finished";
  if (mockOperation.kind !== "drink") return;
  for (const consumption of mockDrinkConsumption) {
    const bottle = mockBottles.find(
      (candidate) => candidate.pumpId === consumption.pumpId,
    );
    if (!bottle) continue;
    bottle.remainingMl = Math.max(0, bottle.remainingMl - consumption.amountMl);
    if (
      bottle.remainingMl === 0 ||
      mockScenario() === "bottle_may_be_empty"
    ) {
      emitMockMachineEvent({
        type: "machine_warning",
        warning: "bottle_may_be_empty",
        pumpId: bottle.pumpId,
      });
    }
  }
  mockDrinkConsumption = [];
}

function beginMockOperation(
  kind: "drink" | "cleaning" | "calibration",
  label: string,
  durationMs: number,
  recipeId?: number,
) {
  refreshMockOperation();
  if (
    mockOperation.state === "running" ||
    (mockOperation.kind === "calibration" &&
      mockOperation.state === "finished")
  ) {
    mockError(409, "machine_busy");
  }
  mockOperation = {
    state: "running",
    progress: 0,
    kind,
    label,
    ...(recipeId === undefined ? {} : { recipeId }),
  };
  mockOperationStarted = Date.now();
  mockOperationDuration = durationMs;
}

function mockRequest<T>(path: string, method: HttpMethod, body?: unknown): T {
  refreshMockOperation();

  if (path === "/api/health" && method === "GET")
    return { status: "ok" } as T;
  if (path === "/api/status" && method === "GET")
    return copy(mockOperation) as T;
  if (path === "/api/device" && method === "GET")
    return { name: "Neat", model: "ESP32-C6", version: "1.0.0" } as T;
  if (path === "/api/device/restart" && method === "POST")
    return { status: "restarting" } as T;

  if (path === "/api/settings/device") {
    if (method === "GET") return copy(mockDeviceSettings) as T;
    if (method === "PUT") {
      mockDeviceSettings = copy(body as DeviceSettings);
      return undefined as T;
    }
  }

  if (path === "/api/bottles" && method === "GET")
    return copy(mockBottles) as T;
  const bottleMatch = path.match(/^\/api\/bottles\/(\d+)$/);
  if (bottleMatch) {
    const pumpId = Number(bottleMatch[1]);
    const existing = mockBottles.find((bottle) => bottle.pumpId === pumpId);
    if (method === "GET") {
      if (!existing) mockError(404, "bottle_not_found");
      return copy(existing) as T;
    }
    if (method === "PUT") {
      const value = body as Omit<BottleState, "pumpId">;
      const updated = {
        pumpId,
        capacityMl: value.capacityMl,
        remainingMl: Math.max(0, value.remainingMl),
      };
      mockBottles = existing
        ? mockBottles.map((bottle) =>
            bottle.pumpId === pumpId ? updated : bottle,
          )
        : [...mockBottles, updated];
      return undefined as T;
    }
  }

  if (path === "/api/recipes") {
    if (method === "GET") return copy(mockRecipes) as T;
    if (method === "POST") {
      const value = body as Omit<RecipeRecord, "id">;
      const created = { ...copy(value), id: nextId(mockRecipes) };
      mockRecipes.push(created);
      return copy(created) as T;
    }
  }
  const recipeStart = path.match(/^\/api\/recipes\/(\d+)\/start$/);
  if (recipeStart && method === "POST") {
    const recipeId = Number(recipeStart[1]);
    const recipe = mockRecipes.find((candidate) => candidate.id === recipeId);
    if (!recipe) mockError(404, "recipe_not_found");
    const scenario = mockScenario();
    if (scenario === "no_glass") mockError(409, "no_glass");
    if (scenario === "ingredient_not_available")
      mockError(409, "ingredient_not_available");
    if (scenario === "pump_not_calibrated")
      mockError(409, "pump_not_calibrated");

    const overrides = (body as { overrides: RecipeItem[] }).overrides ?? [];
    const effectiveItems = recipe.items.map(
      (item) =>
        overrides.find(
          (override) => override.ingredientId === item.ingredientId,
        ) ?? item,
    );
    for (const override of overrides) {
      if (
        !effectiveItems.some(
          (item) => item.ingredientId === override.ingredientId,
        )
      )
        effectiveItems.push(override);
    }
    mockDrinkConsumption = [];
    for (const item of effectiveItems.filter((item) => item.amountMl > 0)) {
      const pump = mockPumps.find(
        (candidate) => candidate.ingredientId === item.ingredientId,
      );
      if (!pump) mockError(409, "ingredient_not_available");
      if (!pump.mlPerSec || pump.mlPerSec <= 0)
        mockError(409, "pump_not_calibrated");
      const consumption = mockDrinkConsumption.find(
        (candidate) => candidate.pumpId === pump.id,
      );
      if (consumption) consumption.amountMl += item.amountMl;
      else
        mockDrinkConsumption.push({
          pumpId: pump.id,
          amountMl: item.amountMl,
        });
    }
    mockGlassRemovalSent = false;
    beginMockOperation("drink", recipe.name, 4_000, recipe.id);
    return undefined as T;
  }
  const recipeMatch = path.match(/^\/api\/recipes\/(\d+)$/);
  if (recipeMatch) {
    const id = Number(recipeMatch[1]);
    const existing = mockRecipes.find((recipe) => recipe.id === id);
    if (!existing) mockError(404, "recipe_not_found");
    if (method === "GET") return copy(existing) as T;
    if (method === "PUT") {
      mockRecipes = mockRecipes.map((recipe) =>
        recipe.id === id
          ? { id, ...(copy(body) as Omit<RecipeRecord, "id">) }
          : recipe,
      );
      return undefined as T;
    }
    if (method === "DELETE") {
      mockRecipes = mockRecipes.filter((recipe) => recipe.id !== id);
      return undefined as T;
    }
  }

  if (path === "/api/ingredients") {
    if (method === "GET") return copy(mockIngredients) as T;
    if (method === "POST") {
      const created = {
        id: nextId(mockIngredients),
        name: (body as { name: string }).name,
      };
      mockIngredients.push(created);
      return copy(created) as T;
    }
  }
  const ingredientMatch = path.match(/^\/api\/ingredients\/(\d+)$/);
  if (ingredientMatch) {
    const id = Number(ingredientMatch[1]);
    const existing = mockIngredients.find((item) => item.id === id);
    if (!existing) mockError(404, "ingredient_not_found");
    if (method === "GET") return copy(existing) as T;
    if (method === "PUT") {
      mockIngredients = mockIngredients.map((item) =>
        item.id === id ? { id, name: (body as { name: string }).name } : item,
      );
      return undefined as T;
    }
    if (method === "DELETE") {
      mockIngredients = mockIngredients.filter((item) => item.id !== id);
      return undefined as T;
    }
  }

  if (path === "/api/pumps") {
    if (method === "GET") return copy(mockPumps) as T;
    if (method === "POST") {
      const pump = copy(body as PumpConfig);
      if (mockPumps.some((candidate) => candidate.id === pump.id))
        mockError(409, "pump_not_created");
      mockPumps.push(pump);
      return copy(pump) as T;
    }
  }
  const assignmentMatch = path.match(/^\/api\/pumps\/(\d+)\/ingredient$/);
  if (assignmentMatch && method === "PUT") {
    const id = Number(assignmentMatch[1]);
    if (!mockPumps.some((pump) => pump.id === id))
      mockError(404, "pump_not_found");
    mockPumps = mockPumps.map((pump) =>
      pump.id === id
        ? {
            ...pump,
            ingredientId: (body as { ingredientId: number | null })
              .ingredientId,
          }
        : pump,
    );
    return undefined as T;
  }
  const pumpMatch = path.match(/^\/api\/pumps\/(\d+)$/);
  if (pumpMatch) {
    const id = Number(pumpMatch[1]);
    const existing = mockPumps.find((pump) => pump.id === id);
    if (!existing) mockError(404, "pump_not_found");
    if (method === "GET") return copy(existing) as T;
    if (method === "PUT") {
      mockPumps = mockPumps.map((pump) =>
        pump.id === id ? copy(body as PumpConfig) : pump,
      );
      return undefined as T;
    }
    if (method === "DELETE") {
      mockPumps = mockPumps.filter((pump) => pump.id !== id);
      return undefined as T;
    }
  }

  if (path === "/api/cleaning/start" && method === "POST") {
    if (!mockPumps.length) mockError(409, "no_pumps_configured");
    beginMockOperation("cleaning", "Rinsing all pumps", 60_000);
    return undefined as T;
  }
  const cleaningMatch = path.match(
    /^\/api\/cleaning\/pumps\/(\d+)\/start$/,
  );
  if (cleaningMatch && method === "POST") {
    const id = Number(cleaningMatch[1]);
    if (!mockPumps.some((pump) => pump.id === id))
      mockError(404, "pump_not_found");
    beginMockOperation("cleaning", `Rinsing pump ${id}`, 60_000);
    return undefined as T;
  }
  if (path === "/api/calibration/start" && method === "POST") {
    const value = body as { pumpId: number; durationMs: number };
    if (!mockPumps.some((pump) => pump.id === value.pumpId))
      mockError(404, "pump_not_found");
    if (value.durationMs <= 0 || value.durationMs > 120_000)
      mockError(400, "invalid_calibration");
    beginMockOperation(
      "calibration",
      `Calibrating pump ${value.pumpId}`,
      value.durationMs,
    );
    mockCalibration = value;
    return undefined as T;
  }
  if (path === "/api/calibration/finish" && method === "POST") {
    if (
      !mockCalibration ||
      mockOperation.kind !== "calibration" ||
      mockOperation.state !== "finished"
    )
      mockError(409, "calibration_not_ready");
    const measuredMl = (body as { measuredMl: number }).measuredMl;
    if (measuredMl <= 0) mockError(400, "invalid_measurement");
    const rate = measuredMl / (mockCalibration.durationMs / 1000);
    mockPumps = mockPumps.map((pump) =>
      pump.id === mockCalibration?.pumpId ? { ...pump, mlPerSec: rate } : pump,
    );
    mockCalibration = null;
    mockOperation = { state: "idle", progress: 0 };
    return undefined as T;
  }
  if (path === "/api/operation/stop" && method === "POST") {
    mockOperation = { ...mockOperation, state: "stopped", progress: 0 };
    mockCalibration = null;
    mockDrinkConsumption = [];
    return undefined as T;
  }

  if (path === "/api/network/status" && method === "GET")
    return copy(mockNetwork) as T;
  if (path === "/api/network/scan" && method === "POST") {
    mockNetwork.networks = [
      { ssid: "HomeWiFi", secured: true, rssi: -38 },
      { ssid: "Neat_Guest", secured: true, rssi: -55 },
      { ssid: "CafeNet", secured: false, rssi: -76 },
    ];
    emitMockMachineEvent({
      type: "wifi_scan_done",
      networks: copy(mockNetwork.networks),
    });
    return undefined as T;
  }
  if (path === "/api/network/connect" && method === "POST") {
    mockNetwork = {
      ...mockNetwork,
      connected: true,
      ssid: (body as { ssid: string }).ssid,
    };
    return undefined as T;
  }

  return mockError(404, "route_not_found");
}

async function realRequest<T>(
  path: string,
  method: HttpMethod,
  body?: unknown,
) {
  const response = await fetch(path, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;
  if (!response.ok) {
    const key =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : "request_failed";
    throw new ApiError(response.status, key);
  }
  return payload as T;
}

async function request<T>(
  path: string,
  method: HttpMethod = "GET",
  body?: unknown,
) {
  return USE_MOCK_API
    ? Promise.resolve(mockRequest<T>(path, method, body))
    : realRequest<T>(path, method, body);
}

function normalize(record: RecipeRecord, names: Ingredient[]): Cocktail {
  const presentation = mockCocktails.find(
    (cocktail) => cocktail.imageKey === record.imageKey,
  );
  return {
    id: record.id,
    name: record.name,
    imageKey: record.imageKey,
    subtitle: presentation?.subtitle ?? "",
    description: presentation?.description ?? "",
    manualItems: presentation?.manualItems ?? [],
    availableSizes: presentation?.availableSizes ?? [300, 400, 500],
    defaultSize: presentation?.defaultSize ?? 400,
    defaultStrength: presentation?.defaultStrength ?? "standard",
    ingredients: record.items.map((item) => {
      const presentedIngredient = presentation?.ingredients.find(
        (ingredient) => ingredient.id === item.ingredientId,
      );
      return {
        id: item.ingredientId,
        name:
          names.find((ingredient) => ingredient.id === item.ingredientId)
            ?.name ?? `Ingredient ${item.ingredientId}`,
        amount: `${item.amountMl} ml`,
        category: presentedIngredient?.category ?? "Mixer",
      };
    }),
  };
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

export async function getRecipes() {
  const [records, names] = await Promise.all([
    request<RecipeRecord[]>("/api/recipes"),
    getIngredients(),
  ]);
  return records.map((record) => normalize(record, names));
}
export async function getRecipe(id: number) {
  const [record, names] = await Promise.all([
    request<RecipeRecord>(`/api/recipes/${id}`),
    getIngredients(),
  ]);
  return normalize(record, names);
}
export async function saveRecipe(recipe: Cocktail, isNew: boolean) {
  await request(
    isNew ? "/api/recipes" : `/api/recipes/${recipe.id}`,
    isNew ? "POST" : "PUT",
    {
      name: recipe.name,
      imageKey: recipe.imageKey,
      items: recipeItems(recipe),
    },
  );
}
export async function deleteRecipe(id: number) {
  await request(`/api/recipes/${id}`, "DELETE");
}
export async function getIngredients() {
  return request<Ingredient[]>("/api/ingredients");
}
export async function saveIngredient(value: Ingredient, isNew: boolean) {
  await request(
    isNew ? "/api/ingredients" : `/api/ingredients/${value.id}`,
    isNew ? "POST" : "PUT",
    { name: value.name },
  );
}
export async function deleteIngredient(id: number) {
  await request(`/api/ingredients/${id}`, "DELETE");
}
export async function getPumps() {
  return request<PumpConfig[]>("/api/pumps");
}
export async function savePump(value: PumpConfig, isNew: boolean) {
  await request(
    isNew ? "/api/pumps" : `/api/pumps/${value.id}`,
    isNew ? "POST" : "PUT",
    value,
  );
}
export async function assignPump(id: number, ingredientId: number | null) {
  await request(`/api/pumps/${id}/ingredient`, "PUT", { ingredientId });
}
export async function deletePump(id: number) {
  await request(`/api/pumps/${id}`, "DELETE");
}
export interface MakeDrinkRequest {
  recipeId: number;
  overrides: RecipeItem[];
}
export async function makeDrink(value: MakeDrinkRequest) {
  await request(`/api/recipes/${value.recipeId}/start`, "POST", {
    overrides: value.overrides,
  });
}
export async function getStatus() {
  return request<OperationStatus>("/api/status");
}
export async function stopOperation() {
  await request("/api/operation/stop", "POST");
}
export async function startCleaning(pumpId?: number) {
  await request(
    pumpId === undefined
      ? "/api/cleaning/start"
      : `/api/cleaning/pumps/${pumpId}/start`,
    "POST",
  );
}
export async function startCalibration(pumpId: number, durationMs: number) {
  await request("/api/calibration/start", "POST", { pumpId, durationMs });
}
export async function finishCalibration(measuredMl: number) {
  await request("/api/calibration/finish", "POST", { measuredMl });
}
export async function getNetwork() {
  return request<NetworkInfo>("/api/network/status");
}
export async function scanNetworks() {
  await request("/api/network/scan", "POST");
}
export async function connectNetwork(ssid: string, password: string) {
  await request("/api/network/connect", "POST", { ssid, password });
}
export async function getDevice() {
  return request<DeviceInfo>("/api/device");
}
export async function getHealth() {
  return request<{ status: string }>("/api/health");
}
export async function restartDevice() {
  await request("/api/device/restart", "POST");
}
export async function getDeviceSettings() {
  return request<DeviceSettings>("/api/settings/device");
}
export async function updateDeviceSettings(settings: DeviceSettings) {
  await request("/api/settings/device", "PUT", settings);
}
export async function getBottles() {
  return request<BottleState[]>("/api/bottles");
}
export async function getBottle(pumpId: number) {
  return request<BottleState>(`/api/bottles/${pumpId}`);
}
export async function updateBottle(
  pumpId: number,
  bottle: Omit<BottleState, "pumpId">,
) {
  await request(`/api/bottles/${pumpId}`, "PUT", bottle);
}
