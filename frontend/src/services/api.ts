import { mockIngredientSeed, mockRecipeSeed } from "../data/mockSeed";
import type { Cocktail, DrinkStrength } from "../types/cocktail";
import type {
  BottleState,
  DeveloperStatus,
  DeviceInfo,
  DeviceSettings,
  Ingredient,
  NetworkInfo,
  OperationStatus,
  PumpConfig,
  RecipeItem,
  RecipeRecord,
  SystemStatus,
} from "../types/device";
import { createId } from "./id";
import { ApiError } from "./errors";
import { emitMockMachineEvent } from "./mockEvents";
import { mockMediaUsedBytes, removeMockMedia, setMockMedia } from "./mockMedia";

const MOCK_API_STORAGE_KEY = "neat.useMockApi";

function storedMockApiPreference() {
  try {
    const stored = localStorage.getItem(MOCK_API_STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    // Fall back to the build default when browser storage is unavailable.
  }
  return import.meta.env.VITE_USE_MOCK_API === "true";
}

export const USE_MOCK_API = storedMockApiPreference();

export function setMockApiEnabled(enabled: boolean) {
  localStorage.setItem(MOCK_API_STORAGE_KEY, String(enabled));
  window.location.reload();
}
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

let mockRecipes = copy(mockRecipeSeed);
let mockIngredients = copy(mockIngredientSeed);
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
  requireGlassDetection: true,
  drinkSizesMl: [300, 400, 500],
  defaultDrinkSizeMl: 400,
  alcoholStrengthLessFactor: 0.75,
  alcoholStrengthMoreFactor: 1.25,
  successSound: [{ frequencyHz: 880, durationMs: 90 }, { frequencyHz: 1319, durationMs: 140 }],
  errorSound: [{ frequencyHz: 440, durationMs: 130 }, { frequencyHz: 330, durationMs: 210 }],
};
let mockOperation: OperationStatus = {
  state: "idle",
  progress: 0,
  glassPresent: true,
};
let mockOperationStarted = 0;
let mockOperationDuration = 10_000;
let mockIngredientDurations: { ingredientId: number; durationMs: number }[] = [];
let mockCalibration: { pumpId: number; durationMs: number } | null = null;
let mockDrinkConsumption: { pumpId: number; amountMl: number }[] = [];
let mockGlassRemovalSent = false;
let mockLedStates = new Map<number, boolean>();
let mockNetwork: NetworkInfo = {
  connected: true,
  ssid: "HomeWiFi",
  accessPoint: "Neat",
  accessPointPassword: "neat1234",
  address: "192.168.1.42",
  networks: [],
};

function mockScenario(): MockScenario | null {
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
function ingredientCategory(id: number) {
  return mockIngredients.find((value) => value.id === id)?.category ?? "OTHER";
}
function calculateAvailability(recipe: RecipeRecord) {
  const missingIngredientIds: number[] = [];
  const uncalibratedIngredientIds: number[] = [];
  for (const item of recipe.items.filter((value) => value.amountMl > 0 && value.machineDispensed !== false)) {
    const assigned = mockPumps.filter(
      (pump) => pump.ingredientId === item.ingredientId,
    );
    if (!assigned.length) missingIngredientIds.push(item.ingredientId);
    else if (!assigned.some((pump) => (pump.mlPerSec ?? 0) > 0))
      uncalibratedIngredientIds.push(item.ingredientId);
  }
  return {
    available:
      !missingIngredientIds.length && !uncalibratedIngredientIds.length,
    missingIngredientIds,
    uncalibratedIngredientIds,
  };
}
function strengthAvailable(recipe: RecipeRecord) {
  const positive = recipe.items.filter((item) => item.amountMl > 0);
  return positive.some(
    (item) => ingredientCategory(item.ingredientId) === "ALCOHOL",
  );
}
function withDerived(recipe: RecipeRecord): RecipeRecord {
  return {
    ...copy(recipe),
    availability: calculateAvailability(recipe),
    strengthAdjustmentAvailable: strengthAvailable(recipe),
  };
}
function storedRecipe(value: RecipeRecord): RecipeRecord {
  return {
    ...copy(value),
    subtitle: value.subtitle ?? null,
    description: value.description ?? null,
    imageKey: value.imageKey ?? null,
    preparationSteps: value.preparationSteps ?? [],
    availability: {
      available: false,
      missingIngredientIds: [],
      uncalibratedIngredientIds: [],
    },
    strengthAdjustmentAvailable: false,
  };
}
function finalAmounts(
  recipe: RecipeRecord,
  sizeMl: number,
  strength: DrinkStrength,
  overrides: RecipeItem[],
) {
  if (
    !mockDeviceSettings.drinkSizesMl.includes(sizeMl) ||
    recipe.baseSizeMl <= 0
  )
    mockError(400, "invalid_size");
  if (strength !== "standard" && !strengthAvailable(recipe))
    mockError(409, "strength_not_supported");
  const sizeFactor = sizeMl / recipe.baseSizeMl;
  const scaled = recipe.items.map((item) => ({
    ...item,
    exact: item.amountMl * sizeFactor,
  }));
  const standardTotal = scaled.reduce((sum, item) => sum + item.exact, 0);
  const strengthFactor =
    strength === "less"
      ? mockDeviceSettings.alcoholStrengthLessFactor
      : strength === "more"
        ? mockDeviceSettings.alcoholStrengthMoreFactor
        : 1;
  if (strengthFactor !== 1) {
    const alcohol = scaled.filter(
      (item) => ingredientCategory(item.ingredientId) === "ALCOHOL",
    );
    const nonAlcohol = scaled.filter(
      (item) => ingredientCategory(item.ingredientId) !== "ALCOHOL",
    );
    alcohol.forEach((item) => {
      item.exact *= strengthFactor;
    });
    const alcoholTotal = alcohol.reduce((sum, item) => sum + item.exact, 0);
    const originalNonAlcohol = nonAlcohol.reduce(
      (sum, item) => sum + item.exact,
      0,
    );
    const target = Math.max(0, standardTotal - alcoholTotal);
    nonAlcohol.forEach((item) => {
      item.exact =
        originalNonAlcohol > 0 ? (item.exact * target) / originalNonAlcohol : 0;
    });
  }
  const result = scaled.map((item) => ({
    ingredientId: item.ingredientId,
    amountMl: Math.max(0, Math.round(item.exact)),
  }));
  for (const override of overrides) {
    const found = result.find(
      (item) => item.ingredientId === override.ingredientId,
    );
    if (found) found.amountMl = override.amountMl;
    else if (override.amountMl > 0) result.push(copy(override));
  }
  return result.filter((item) => item.amountMl > 0);
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
    mockOperation = {
      ...mockOperation,
      state: "paused",
      glassPresent: false,
    };
    emitMockMachineEvent({ type: "machine_error", error: "glass_removed" });
    return;
  }
  mockOperation.progress = Math.min(
    100,
    Math.floor((elapsed / mockOperationDuration) * 100),
  );
  if (mockOperation.kind === "drink") {
    mockOperation.completedIngredientIds = mockIngredientDurations
      .filter((item) => elapsed >= item.durationMs)
      .map((item) => item.ingredientId);
  }
  if (mockOperation.progress < 100) return;
  mockOperation.state = "finished";
  if (mockOperation.kind !== "drink") return;
  for (const consumption of mockDrinkConsumption) {
    const bottle = mockBottles.find(
      (candidate) => candidate.pumpId === consumption.pumpId,
    );
    if (!bottle) continue;
    bottle.remainingMl = Math.max(0, bottle.remainingMl - consumption.amountMl);
    if (bottle.remainingMl === 0 || mockScenario() === "bottle_may_be_empty")
      emitMockMachineEvent({
        type: "machine_warning",
        warning: "bottle_may_be_empty",
        pumpId: bottle.pumpId,
      });
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
    mockOperation.state === "paused" ||
    (mockOperation.kind === "calibration" && mockOperation.state === "finished")
  )
    mockError(409, "machine_busy");
  mockOperation = {
    state: "running",
    progress: 0,
    kind,
    label,
    glassPresent: true,
    completedIngredientIds: [],
    ...(recipeId === undefined ? {} : { recipeId }),
  };
  mockOperationStarted = Date.now();
  mockOperationDuration = durationMs;
}
function validateSettings(value: DeviceSettings) {
  const sorted = [...value.drinkSizesMl].sort((a, b) => a - b);
  if (
    !sorted.length ||
    sorted.some((size) => !Number.isInteger(size) || size <= 0) ||
    new Set(sorted).size !== sorted.length ||
    !sorted.includes(value.defaultDrinkSizeMl) ||
    value.alcoholStrengthLessFactor <= 0 ||
    value.alcoholStrengthLessFactor >= 1 ||
    value.alcoholStrengthMoreFactor <= 1
    || !value.successSound?.length || !value.errorSound?.length
  )
    mockError(400, "invalid_device_settings");
  return { ...copy(value), drinkSizesMl: sorted };
}
function mockSystemStatus(): SystemStatus {
  const uptimeMs = Math.floor(performance.now());
  return {
    uptimeMs,
    memory: {
      freeHeapBytes: 226000 - Math.floor((uptimeMs / 1000) % 4000),
      minimumFreeHeapBytes: 211200,
      largestFreeBlockBytes: 131072,
    },
    cpu: { utilizationPercent: 8 + Math.round(Math.sin(uptimeMs / 4000) * 3) },
    storage: {
      firmware: { totalBytes: 2621440, usedBytes: 1112368 },
      frontend: { totalBytes: 1048576, usedBytes: 386048 },
      configuration: { totalBytes: 1048576, usedBytes: 8192 },
      media: { totalBytes: 917504, usedBytes: mockMediaUsedBytes() },
    },
    network: {
      mode: "APSTA",
      stationConnected: true,
      rssi: -42,
      accessPointActive: true,
    },
  };
}
function mockDeveloperStatus(): DeveloperStatus {
  refreshMockOperation();
  return {
    glassPresent: mockScenario() !== "no_glass",
    machine: {
      kind: mockOperation.kind ?? "none",
      state: mockOperation.state,
      busy:
        mockOperation.state === "running" || mockOperation.state === "paused",
    },
    pumps: mockPumps.map((pump) => ({
      ...copy(pump),
      running:
        mockOperation.state === "running" &&
        mockOperation.label === `Testing pump ${pump.id}`,
    })),
    bottles: copy(mockBottles),
  };
}

function mockRequest<T>(path: string, method: HttpMethod, body?: unknown): T {
  refreshMockOperation();
  if (path === "/api/health" && method === "GET") return { status: "ok" } as T;
  if (path === "/api/status" && method === "GET")
    return copy(mockOperation) as T;
  if (path === "/api/device" && method === "GET")
    return { id: "neat-mock", name: "Neat", model: "ESP32-C6", version: "1.0.0" } as T;
  if (path === "/api/device/restart" && method === "POST")
    return { status: "restarting" } as T;
  if (path === "/api/system/status" && method === "GET")
    return mockSystemStatus() as T;
  if (path === "/api/settings/device") {
    if (method === "GET") return copy(mockDeviceSettings) as T;
    if (method === "PUT") {
      mockDeviceSettings = validateSettings(body as DeviceSettings);
      return undefined as T;
    }
  }
  if (path === "/api/bottles" && method === "GET")
    return copy(mockBottles) as T;
  const bottleMatch = path.match(/^\/api\/bottles\/(\d+)$/);
  if (bottleMatch) {
    const pumpId = Number(bottleMatch[1]);
    const existing = mockBottles.find((b) => b.pumpId === pumpId);
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
        ? mockBottles.map((b) => (b.pumpId === pumpId ? updated : b))
        : [...mockBottles, updated];
      return undefined as T;
    }
  }
  if (path === "/api/recipes") {
    if (method === "GET") return mockRecipes.map(withDerived) as T;
    if (method === "POST") {
      const value = body as Omit<
        RecipeRecord,
        "id" | "availability" | "strengthAdjustmentAvailable"
      >;
      const created = storedRecipe({
        ...value,
        id: nextId(mockRecipes),
        availability: {
          available: false,
          missingIngredientIds: [],
          uncalibratedIngredientIds: [],
        },
        strengthAdjustmentAvailable: false,
      });
      mockRecipes.push(created);
      return withDerived(created) as T;
    }
  }
  const start = path.match(/^\/api\/recipes\/(\d+)\/start$/);
  if (start && method === "POST") {
    const recipe = mockRecipes.find((r) => r.id === Number(start[1]));
    if (!recipe) mockError(404, "recipe_not_found");
    const scenario = mockScenario();
    if (scenario === "ingredient_not_available")
      mockError(409, "ingredient_not_available");
    if (scenario === "pump_not_calibrated")
      mockError(409, "pump_not_calibrated");
    const value = body as {
      sizeMl: number;
      strength: DrinkStrength;
      overrides?: RecipeItem[];
      ignoreGlass?: boolean;
    };
    if (
      mockDeviceSettings.requireGlassDetection &&
      scenario === "no_glass" &&
      !value.ignoreGlass
    )
      mockError(409, "no_glass");
    const amounts = finalAmounts(
      recipe,
      value.sizeMl,
      value.strength,
      value.overrides ?? [],
    );
    const availability = calculateAvailability({ ...recipe, items: amounts });
    if (availability.missingIngredientIds.length)
      mockError(409, "ingredient_not_available");
    if (availability.uncalibratedIngredientIds.length)
      mockError(409, "pump_not_calibrated");
    mockDrinkConsumption = amounts.map((item) => ({
      pumpId: mockPumps.find((p) => p.ingredientId === item.ingredientId)!.id,
      amountMl: item.amountMl,
    }));
    const rawDurations = amounts.map((item) => {
      const pump = mockPumps.find(
        (candidate) => candidate.ingredientId === item.ingredientId,
      )!;
      return {
        ingredientId: item.ingredientId,
        duration: item.amountMl / (pump.mlPerSec ?? 1),
      };
    });
    const longestDuration = Math.max(
      1,
      ...rawDurations.map((item) => item.duration),
    );
    mockIngredientDurations = rawDurations.map((item) => ({
      ingredientId: item.ingredientId,
      durationMs: Math.round((item.duration / longestDuration) * 10_000),
    }));
    mockGlassRemovalSent = false;
    beginMockOperation("drink", recipe.name, 10_000, recipe.id);
    return undefined as T;
  }
  const recipeMatch = path.match(/^\/api\/recipes\/(\d+)$/);
  if (recipeMatch) {
    const id = Number(recipeMatch[1]);
    const existing = mockRecipes.find((r) => r.id === id);
    if (!existing) mockError(404, "recipe_not_found");
    if (method === "GET") return withDerived(existing) as T;
    if (method === "PUT") {
      mockRecipes = mockRecipes.map((r) =>
        r.id === id ? storedRecipe({ ...(body as RecipeRecord), id }) : r,
      );
      return undefined as T;
    }
    if (method === "DELETE") {
      mockRecipes = mockRecipes.filter((r) => r.id !== id);
      return undefined as T;
    }
  }
  if (path === "/api/ingredients") {
    if (method === "GET") return copy(mockIngredients) as T;
    if (method === "POST") {
      const value = body as Omit<Ingredient, "id">;
      const created = { id: nextId(mockIngredients), ...copy(value) };
      mockIngredients.push(created);
      return copy(created) as T;
    }
  }
  const ingredientMatch = path.match(/^\/api\/ingredients\/(\d+)$/);
  if (ingredientMatch) {
    const id = Number(ingredientMatch[1]);
    const existing = mockIngredients.find((i) => i.id === id);
    if (!existing) mockError(404, "ingredient_not_found");
    if (method === "GET") return copy(existing) as T;
    if (method === "PUT") {
      mockIngredients = mockIngredients.map((i) =>
        i.id === id ? { id, ...(body as Omit<Ingredient, "id">) } : i,
      );
      return undefined as T;
    }
    if (method === "DELETE") {
      mockIngredients = mockIngredients.filter((i) => i.id !== id);
      return undefined as T;
    }
  }
  if (path === "/api/pumps") {
    if (method === "GET") return copy(mockPumps) as T;
    if (method === "POST") {
      const pump = copy(body as PumpConfig);
      if (mockPumps.some((p) => p.id === pump.id))
        mockError(409, "pump_not_created");
      mockPumps.push(pump);
      return copy(pump) as T;
    }
  }
  const assignment = path.match(/^\/api\/pumps\/(\d+)\/ingredient$/);
  if (assignment && method === "PUT") {
    const id = Number(assignment[1]);
    if (!mockPumps.some((p) => p.id === id)) mockError(404, "pump_not_found");
    mockPumps = mockPumps.map((p) =>
      p.id === id
        ? {
            ...p,
            ingredientId: (body as { ingredientId: number | null })
              .ingredientId,
          }
        : p,
    );
    return undefined as T;
  }
  const pumpMatch = path.match(/^\/api\/pumps\/(\d+)$/);
  if (pumpMatch) {
    const id = Number(pumpMatch[1]);
    const existing = mockPumps.find((p) => p.id === id);
    if (!existing) mockError(404, "pump_not_found");
    if (method === "GET") return copy(existing) as T;
    if (method === "PUT") {
      mockPumps = mockPumps.map((p) =>
        p.id === id ? copy(body as PumpConfig) : p,
      );
      return undefined as T;
    }
    if (method === "DELETE") {
      mockPumps = mockPumps.filter((p) => p.id !== id);
      return undefined as T;
    }
  }
  if (path === "/api/cleaning/start" && method === "POST") {
    if (!mockPumps.length) mockError(409, "no_pumps_configured");
    beginMockOperation("cleaning", "Rinsing all pumps", 60000);
    return undefined as T;
  }
  const cleaning = path.match(/^\/api\/cleaning\/pumps\/(\d+)\/start$/);
  if (cleaning && method === "POST") {
    const id = Number(cleaning[1]);
    if (!mockPumps.some((p) => p.id === id)) mockError(404, "pump_not_found");
    beginMockOperation("cleaning", `Rinsing pump ${id}`, 60000);
    return undefined as T;
  }
  if (path === "/api/calibration/start" && method === "POST") {
    const value = body as { pumpId: number; durationMs: number };
    if (!mockPumps.some((p) => p.id === value.pumpId))
      mockError(404, "pump_not_found");
    if (value.durationMs <= 0 || value.durationMs > 120000)
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
    const calibration = mockCalibration;
    mockPumps = mockPumps.map((p) =>
      p.id === calibration.pumpId
        ? { ...p, mlPerSec: measuredMl / (calibration.durationMs / 1000) }
        : p,
    );
    mockCalibration = null;
    mockOperation = { state: "idle", progress: 0, glassPresent: true };
    return undefined as T;
  }
  if (path === "/api/operation/stop" && method === "POST") {
    mockOperation = {
      ...mockOperation,
      state: "stopped",
      progress: 0,
      glassPresent: true,
    };
    mockCalibration = null;
    mockDrinkConsumption = [];
    return undefined as T;
  }
  if (path === "/api/network/status" && method === "GET")
    return copy(mockNetwork) as T;
  if (path === "/api/network/internet" && method === "GET")
    return {
      connected: mockNetwork.connected,
      dnsResolved: mockNetwork.connected,
      cloudReachable: mockNetwork.connected,
      reachable: mockNetwork.connected,
      statusCode: mockNetwork.connected ? 200 : 0,
      latencyMs: mockNetwork.connected ? 84 : 0,
    } as T;
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
  if (path === "/api/network/disconnect" && method === "POST") {
    mockNetwork = { ...mockNetwork, connected: false, address: "" };
    return undefined as T;
  }
  if (path === "/api/network/reconnect" && method === "POST") {
    if (!mockNetwork.ssid) mockError(409, "no_saved_network");
    mockNetwork = {
      ...mockNetwork,
      connected: true,
      address: "192.168.1.42",
    };
    return undefined as T;
  }
  if (path === "/api/network/connection" && method === "DELETE") {
    mockNetwork = { ...mockNetwork, connected: false, ssid: null, address: "" };
    return undefined as T;
  }
  if (path === "/api/operation/resume" && method === "POST") {
    if (mockOperation.state !== "paused")
      mockError(409, "operation_not_paused");
    const ignoreGlass = (body as { ignoreGlass?: boolean } | undefined)
      ?.ignoreGlass;
    if (!mockOperation.glassPresent && !ignoreGlass)
      mockError(409, "no_glass");
    mockOperation = {
      ...mockOperation,
      state: "running",
      glassPresent: ignoreGlass ? false : true,
    };
    mockOperationStarted = Date.now() -
      (mockOperation.progress / 100) * mockOperationDuration;
    return undefined as T;
  }
  if (path === "/api/developer/status" && method === "GET")
    return mockDeveloperStatus() as T;
  if (path === "/api/developer/pumps/stop" && method === "POST") {
    mockOperation = { state: "idle", progress: 0, glassPresent: true };
    return undefined as T;
  }
  const devPump = path.match(/^\/api\/developer\/pumps\/(\d+)\/(test|stop)$/);
  if (devPump && method === "POST") {
    const id = Number(devPump[1]);
    if (!mockPumps.some((p) => p.id === id)) mockError(404, "pump_not_found");
    if (devPump[2] === "test") {
      const duration = (body as { durationMs: number }).durationMs;
      if (duration < 1 || duration > 5000) mockError(400, "invalid_duration");
      beginMockOperation("cleaning", `Testing pump ${id}`, duration);
    } else
      mockOperation = { state: "idle", progress: 0, glassPresent: true };
    return undefined as T;
  }
  const led = path.match(/^\/api\/developer\/leds\/(\d+)$/);
  if (led && method === "PUT") {
    mockLedStates.set(Number(led[1]), (body as { state: boolean }).state);
    return undefined as T;
  }
  if (path === "/api/developer/leds/reset" && method === "POST") {
    mockLedStates.clear();
    return undefined as T;
  }
  if (path === "/api/developer/buzzer/test" && method === "POST")
    return undefined as T;
  if (path === "/api/developer/buzzer/stop" && method === "POST")
    return undefined as T;
  return mockError(404, "route_not_found");
}

async function realRequest<T>(
  path: string,
  method: HttpMethod,
  body?: unknown,
) {
  const timeoutMs = path === "/api/health"
    ? 2500
    : path === "/api/network/internet" || path.startsWith("/api/cloud/")
      ? 25000
      : 15000;
  const response = await fetch(path, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = undefined;
  }
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
  return {
    ...record,
    subtitle: record.subtitle ?? "",
    description: record.description ?? "",
    ingredients: record.items.map((item) => {
      const ingredient = names.find((value) => value.id === item.ingredientId);
      return {
        ...item,
        id: item.ingredientId,
        name: ingredient?.name ?? `Ingredient ${item.ingredientId}`,
        category: ingredient?.category ?? "OTHER",
        amount: `${item.amountMl} ml`,
      };
    }),
  };
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
      subtitle: recipe.subtitle || null,
      description: recipe.description || null,
      baseSizeMl: recipe.baseSizeMl,
      preparationSteps: recipe.preparationSteps,
      items: recipe.ingredients.map(({ ingredientId, amountMl, machineDispensed }) => ({
        ingredientId,
        amountMl,
        machineDispensed: machineDispensed !== false,
      })),
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
  return request<Ingredient | void>(
    isNew ? "/api/ingredients" : `/api/ingredients/${value.id}`,
    isNew ? "POST" : "PUT",
    { name: value.name, category: value.category },
  );
}
export async function installBuiltInRecipe(templateId: number) {
  const template = mockRecipeSeed.find((item) => item.id === templateId);
  if (!template) throw new ApiError(404, "recipe_not_found");
  const existingRecipes = await getRecipes();
  if (existingRecipes.some((recipe) => recipe.name.trim().toLocaleLowerCase() === template.name.trim().toLocaleLowerCase())) return;
  const ingredients = await getIngredients();
  const resolved = new Map<number, Ingredient>();
  for (const item of template.items) {
    const seed = mockIngredientSeed.find((value) => value.id === item.ingredientId);
    if (!seed) continue;
    let ingredient = ingredients.find((value) => value.name.trim().toLocaleLowerCase() === seed.name.trim().toLocaleLowerCase());
    if (!ingredient) {
      const created = await saveIngredient({ ...seed, id: 0 }, true);
      if (!created) throw new ApiError(500, "ingredient_not_created");
      ingredient = created;
      ingredients.push(created);
    }
    resolved.set(item.ingredientId, ingredient);
  }
  const cocktail: Cocktail = {
    id: 0,
    name: template.name,
    imageKey: template.imageKey,
    subtitle: template.subtitle ?? "",
    description: template.description ?? "",
    baseSizeMl: template.baseSizeMl,
    preparationSteps: template.preparationSteps,
    availability: template.availability,
    strengthAdjustmentAvailable: template.strengthAdjustmentAvailable,
    ingredients: template.items.map((item) => {
      const ingredient = resolved.get(item.ingredientId)!;
      const manual = ["Soda Water", "Cola", "Tonic Water", "Ginger Beer"].includes(ingredient.name);
      return { ...ingredient, id: ingredient.id, ingredientId: ingredient.id, amountMl: item.amountMl, machineDispensed: !manual, amount: `${item.amountMl} ml` };
    }),
  };
  await saveRecipe(cocktail, true);
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
  sizeMl: number;
  strength: DrinkStrength;
  overrides: RecipeItem[];
  ignoreGlass?: boolean;
}
export async function makeDrink(value: MakeDrinkRequest) {
  await request(`/api/recipes/${value.recipeId}/start`, "POST", {
    sizeMl: value.sizeMl,
    strength: value.strength,
    overrides: value.overrides,
    ignoreGlass: value.ignoreGlass ?? false,
  });
}
export async function getStatus() {
  return request<OperationStatus>("/api/status");
}
export async function stopOperation() {
  await request("/api/operation/stop", "POST");
}
export async function resumeOperation(ignoreGlass = false) {
  await request("/api/operation/resume", "POST", { ignoreGlass });
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
export async function testInternetConnection() {
  return request<{
    connected: boolean;
    dnsResolved: boolean;
    cloudReachable: boolean;
    reachable: boolean;
    statusCode: number;
    latencyMs: number;
  }>("/api/network/internet");
}

export async function pairCloudThroughDevice(value: {
  code: string;
  baseUrl: string;
}) {
  console.log("value: ", value)
  return request<{ machineId: string }>("/api/cloud/pair", "POST", value);
}

export async function heartbeatCloudThroughDevice(value: {
  recipeIds: string[];
  baseUrl: string;
}) {
  return request<{ ok: boolean; paired: boolean; publicQueueUrl: string }>(
    "/api/cloud/heartbeat", "POST", value,
  );
}

export async function syncCloudThroughDevice(value: {
  recipeIds: string[];
  baseUrl: string;
}) {
  return request<{
    recipes: { id: string; machineRecipeId: number }[];
    requestedRecipeIds: string[];
  }>("/api/cloud/sync", "POST", value);
}

export async function getCloudQueueThroughDevice(value: {
  machineId: string;
  baseUrl: string;
}) {
  return request<import("../types/cloud").CloudQueueEntry[]>(
    "/api/cloud/queue", "POST", value,
  );
}

export async function claimCloudQueueThroughDevice(value: {
  machineId: string;
  entryId: string;
  baseUrl: string;
}) {
  return request<import("../types/cloud").CloudQueueEntry>(
    "/api/cloud/queue/claim", "POST", value,
  );
}
export async function scanNetworks() {
  await request("/api/network/scan", "POST");
}
export async function connectNetwork(ssid: string, password: string) {
  await request("/api/network/connect", "POST", { ssid, password });
}
export async function disconnectNetwork() {
  await request("/api/network/disconnect", "POST");
}
export async function reconnectNetwork() {
  await request("/api/network/reconnect", "POST");
}
export async function forgetNetwork() {
  await request("/api/network/connection", "DELETE");
}
export async function getDevice() {
  return request<DeviceInfo>("/api/device");
}
export async function getHealth() {
  const health = await request<{ status: string }>("/api/health");
  if (!health || health.status !== "ok") {
    throw new ApiError(0, "connection_lost");
  }
  return health;
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
export async function getSystemStatus() {
  return request<SystemStatus>("/api/system/status");
}
export async function getDeveloperStatus() {
  return request<DeveloperStatus>("/api/developer/status");
}
export async function testDeveloperPump(id: number, durationMs: number) {
  await request(`/api/developer/pumps/${id}/test`, "POST", { durationMs });
}
export async function stopDeveloperPump(id: number) {
  await request(`/api/developer/pumps/${id}/stop`, "POST");
}
export async function stopAllDeveloperPumps() {
  await request("/api/developer/pumps/stop", "POST");
}
export async function setDeveloperLed(id: number, state: boolean) {
  await request(`/api/developer/leds/${id}`, "PUT", { state });
}
export async function resetDeveloperLeds() {
  await request("/api/developer/leds/reset", "POST");
}
export async function testDeveloperBuzzer(melody: "success" | "error") {
  await request("/api/developer/buzzer/test", "POST", { melody });
}
export async function stopDeveloperBuzzer() {
  await request("/api/developer/buzzer/stop", "POST");
}
export async function uploadImage(blob: Blob) {
  if (USE_MOCK_API) {
    if (blob.size > 512 * 1024) mockError(413, "image_too_large");
    const id = createId().replaceAll("-", "").slice(0, 16);
    setMockMedia(id, blob);
    return { imageKey: `media:${id}` };
  }
  const response = await fetch("/api/media/images", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "image/webp" },
    body: blob,
    signal: AbortSignal.timeout(30000),
  });
  const payload = (await response.json()) as {
    imageKey?: string;
    error?: string;
  };
  if (!response.ok)
    throw new ApiError(response.status, payload.error ?? "request_failed");
  return payload as { imageKey: string };
}
export async function deleteImage(imageKey: string) {
  const id = imageKey.startsWith("media:") ? imageKey.slice(6) : "";
  if (!id) throw new ApiError(400, "invalid_image_id");
  if (USE_MOCK_API) {
    if (mockRecipes.some((recipe) => recipe.imageKey === imageKey))
      mockError(409, "image_in_use");
    if (!removeMockMedia(id)) mockError(404, "image_not_found");
    return;
  }
  await request(`/api/media/images/${id}`, "DELETE");
}
