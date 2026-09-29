import { mockRecipeSeed } from "../data/mockSeed";
import type {
  CloudConfig,
  CloudMachine,
  CloudQueueEntry,
  CloudRecipe,
} from "../types/cloud";
import {
  claimCloudQueueThroughDevice,
  getCloudQueueThroughDevice,
  getDevice,
  getRecipes,
  heartbeatCloudThroughDevice,
  installBuiltInRecipe,
  pairCloudThroughDevice,
  syncCloudThroughDevice,
  USE_MOCK_API,
} from "./api";
import { createId } from "./id";

const CONFIG_KEY = "neat.cloudConfig";
const QUEUE_KEY = "neat.mockCloudQueue";
const OFFLINE_QUEUE_KEY = "neat.offlineEventQueue";
const DEVICE_ID_KEY = "neat.cloudDeviceId";

export const defaultCloudConfig: CloudConfig = {
  restBaseUrl: "https://api.neat.apps.thiering.org",
  websocketUrl: "wss://api.neat.apps.thiering.org",
  publicSiteUrl: "https://neat.apps.thiering.org",
  machineId: "",
};

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function getCloudConfig(): CloudConfig {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "null") as
      | Partial<CloudConfig>
      | null;
    const config = {
      restBaseUrl: trimTrailingSlash(
        stored?.restBaseUrl ?? defaultCloudConfig.restBaseUrl,
      ),
      websocketUrl: trimTrailingSlash(
        stored?.websocketUrl ?? defaultCloudConfig.websocketUrl,
      ),
      publicSiteUrl: trimTrailingSlash(
        stored?.publicSiteUrl ?? defaultCloudConfig.publicSiteUrl,
      ),
      machineId: stored?.machineId?.trim() || cloudDeviceId(),
    };
    if (!stored?.machineId?.trim()) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return config;
  } catch {
    const config = { ...defaultCloudConfig, machineId: cloudDeviceId() };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return config;
  }
}

export function saveCloudConfig(value: CloudConfig) {
  const normalized = {
    restBaseUrl: trimTrailingSlash(value.restBaseUrl),
    websocketUrl: trimTrailingSlash(value.websocketUrl),
    publicSiteUrl: trimTrailingSlash(value.publicSiteUrl),
    machineId: value.machineId.trim(),
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}

export function cloudDeviceId() {
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const created = createId("neat-");
  localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export async function pairCloudMachine(code: string) {
  const device = USE_MOCK_API ? null : await getDevice();
  const machineId = device?.id ?? cloudDeviceId();
  console.log("Pairing: machineId", machineId, " / device:", device);
  if (!USE_MOCK_API) {
    console.log("Code:", code)
    await pairCloudThroughDevice({
      code: code.replace(/\s/g, ""),
      baseUrl: getCloudConfig().restBaseUrl,
    });
  }
  const next = saveCloudConfig({ ...getCloudConfig(), machineId });
  const importedRecipes = await syncRequestedRecipes().catch(() => 0);
  return { config: next, importedRecipes };
}

export async function syncRequestedRecipes() {
  if (USE_MOCK_API) return 0;
  const installed = await getRecipes();
  const installedIds = installed.map((recipe) => recipe.imageKey).filter((value): value is string => Boolean(value));
  const result = await syncCloudThroughDevice({
    recipeIds: installedIds,
    baseUrl: getCloudConfig().restBaseUrl,
  });
  let imported = 0;
  for (const id of result.requestedRecipeIds) {
    const recipe = result.recipes.find((item) => item.id === id);
    if (!recipe || installed.some((item) => item.imageKey === id)) continue;
    await installBuiltInRecipe(recipe.machineRecipeId);
    imported += 1;
  }
  return imported;
}

export async function sendCloudHeartbeat(recipeIds: string[] = []) {
  let { machineId } = getCloudConfig();
  if (!machineId) {
    machineId = cloudDeviceId();
    saveCloudConfig({ ...getCloudConfig(), machineId });
  }
  if (USE_MOCK_API) return;
  const device = await getDevice();
  if (device.id !== machineId) {
    machineId = device.id;
    saveCloudConfig({ ...getCloudConfig(), machineId });
  }
  await heartbeatCloudThroughDevice({
    recipeIds,
    baseUrl: getCloudConfig().restBaseUrl,
  });
}

export function cloudWebSocketUrl(machineId = getCloudConfig().machineId) {
  const { websocketUrl } = getCloudConfig();
  return `${websocketUrl}/v1/machines/${encodeURIComponent(machineId)}/events`;
}

export function createCloudWebSocket(
  machineId: string,
  onEvent: (event: { type: string }) => void,
) {
  void machineId;
  void onEvent;
  // A tablet on the Neat access point does not get internet routing through
  // the ESP32. Queue updates therefore use local polling through the device.
  return () => undefined;
}

async function cloudRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${getCloudConfig().restBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Cloud request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function readMock<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function writeMock<T>(key: string, values: T[]) {
  localStorage.setItem(key, JSON.stringify(values));
}

function mockMachine(machineId: string): CloudMachine {
  const planning = new URLSearchParams(
    window.location.hash.split("?")[1] ?? "",
  ).get("mode") === "planning";
  return {
    id: machineId,
    name: "Neat",
    online: true,
    mode: planning ? "planning" : "live",
    partyId: "demo-party",
    partyName: "Tonight at Neat",
    location: null,
    startsAt: null,
  };
}

function mockRecipes(): CloudRecipe[] {
  const connectedIngredients = new Set([1, 2, 5, 7, 8, 9]);
  return mockRecipeSeed.map((recipe) => ({
    id: String(recipe.id),
    machineRecipeId: recipe.id,
    name: recipe.name,
    subtitle: recipe.subtitle ?? "",
    description: recipe.description ?? "",
    imageKey: recipe.imageKey,
    imageUrl: null,
    available: recipe.items.every((item) =>
      connectedIngredients.has(item.ingredientId),
    ),
  }));
}

export async function getCloudMachine(machineId: string) {
  if (USE_MOCK_API) return mockMachine(machineId);
  return cloudRequest<CloudMachine>(
    `/v1/machines/${encodeURIComponent(machineId)}`,
  );
}

export async function getCloudRecipes(machineId: string) {
  if (USE_MOCK_API) return mockRecipes();
  return cloudRequest<CloudRecipe[]>(
    `/v1/machines/${encodeURIComponent(machineId)}/recipes`,
  );
}

export async function getCloudQueue(machineId: string) {
  if (!machineId)
    return readMock<CloudQueueEntry>(OFFLINE_QUEUE_KEY).filter(
      (entry) => entry.status === "waiting",
    );
  if (USE_MOCK_API)
    return readMock<CloudQueueEntry>(QUEUE_KEY).filter(
      (entry) => entry.status === "waiting",
    );
  try {
    return await getCloudQueueThroughDevice({
      machineId,
      baseUrl: getCloudConfig().restBaseUrl,
    });
  } catch (error) {
    const offline = readMock<CloudQueueEntry>(OFFLINE_QUEUE_KEY).filter(
      (entry) => entry.status === "waiting",
    );
    if (offline.length) return offline;
    throw error;
  }
}

export async function addCloudQueueEntry(
  machineId: string,
  value: {
    guestName: string;
    recipe: CloudRecipe;
    sizeMl?: number;
    strength?: CloudQueueEntry["strength"];
  },
) {
  const body = {
    guestName: value.guestName.trim(),
    recipeId: value.recipe.id,
    sizeMl: value.sizeMl ?? 400,
    strength: value.strength ?? "standard",
  };
  if (!USE_MOCK_API)
    return cloudRequest<CloudQueueEntry>(
      `/v1/machines/${encodeURIComponent(machineId)}/queue`,
      { method: "POST", body: JSON.stringify(body) },
    );
  const entry: CloudQueueEntry = {
    id: createId(),
    ...body,
    machineRecipeId: value.recipe.machineRecipeId,
    recipeName: value.recipe.name,
    status: "waiting",
    createdAt: new Date().toISOString(),
  };
  writeMock(QUEUE_KEY, [...readMock<CloudQueueEntry>(QUEUE_KEY), entry]);
  return entry;
}

export async function claimCloudQueueEntry(
  machineId: string,
  entryId: string,
) {
  if (!machineId || entryId.startsWith("offline-")) {
    const values = readMock<CloudQueueEntry>(OFFLINE_QUEUE_KEY);
    const entry = values.find((value) => value.id === entryId);
    if (!entry) throw new Error("Offline request no longer exists");
    entry.status = "claimed";
    writeMock(OFFLINE_QUEUE_KEY, values);
    return entry;
  }
  if (!USE_MOCK_API)
    return claimCloudQueueThroughDevice({
      machineId,
      entryId,
      baseUrl: getCloudConfig().restBaseUrl,
    });
  const values = readMock<CloudQueueEntry>(QUEUE_KEY);
  const entry = values.find((value) => value.id === entryId);
  if (!entry) throw new Error("Queue entry no longer exists");
  entry.status = "claimed";
  writeMock(QUEUE_KEY, values);
  return entry;
}

export async function importOfflineEventPack(file: File) {
  const pack = JSON.parse(await file.text()) as {
    format?: unknown;
    requests?: Array<{
      id?: unknown;
      guestName?: unknown;
      recipeId?: unknown;
      recipeName?: unknown;
      createdAt?: unknown;
    }>;
    recipes?: Array<{
      id?: unknown;
      machineRecipeId?: unknown;
      name?: unknown;
    }>;
  };
  if (pack.format !== "neat-event-pack" || !Array.isArray(pack.requests))
    throw new Error("This is not a valid Neat event pack");
  const recipes = new Map(
    (pack.recipes ?? [])
      .filter(
        (recipe) =>
          typeof recipe.id === "string" &&
          typeof recipe.machineRecipeId === "number",
      )
      .map((recipe) => [recipe.id as string, recipe]),
  );
  const queue: CloudQueueEntry[] = pack.requests.map((request, index) => {
    const recipe =
      typeof request.recipeId === "string"
        ? recipes.get(request.recipeId)
        : undefined;
    return {
      id:
        typeof request.id === "string"
          ? `offline-${request.id}`
          : `offline-${index}`,
      guestName:
        typeof request.guestName === "string" ? request.guestName : "Guest",
      recipeId:
        typeof request.recipeId === "string" ? request.recipeId : "custom",
      machineRecipeId:
        typeof recipe?.machineRecipeId === "number"
          ? recipe.machineRecipeId
          : null,
      recipeName:
        typeof request.recipeName === "string"
          ? request.recipeName
          : typeof recipe?.name === "string"
            ? recipe.name
            : "Custom drink",
      sizeMl: 400,
      strength: "standard",
      status: "waiting",
      createdAt:
        typeof request.createdAt === "string"
          ? request.createdAt
          : new Date().toISOString(),
    };
  });
  writeMock(OFFLINE_QUEUE_KEY, queue);
  return queue;
}
