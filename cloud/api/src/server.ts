import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { catalog } from "./catalog.js";
import { JsonStore, type NeatEvent } from "./store.js";

const port = Number(process.env.PORT ?? 8080);
const publicOrigin = process.env.PUBLIC_ORIGIN ?? "https://neat.apps.thiering.org";
const store = new JsonStore(process.env.DATA_FILE ?? "./data/neat.json");
await store.init();

const app = express();
app.set("trust proxy", 1);
app.use(cors({
  origin(origin, done) {
    if (!origin || origin === publicOrigin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || /^http:\/\/(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin)) return done(null, true);
    done(new Error("Origin not allowed"));
  },
  allowedHeaders: ["Content-Type", "X-Guest-Token", "X-Host-Token", "X-Machine-Id"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));
app.use(express.json({ limit: "1mb" }));

const clean = (value: unknown, max = 100) => typeof value === "string" ? value.trim().slice(0, max) : "";
const token = () => randomBytes(24).toString("hex");
const now = () => new Date().toISOString();
const eventForSlug = (slug: string) => store.snapshot().events.find((event) => event.slug === slug);
const hostAllowed = (request: Request, event: NeatEvent) => request.header("X-Host-Token") === event.hostToken;
const publicEvent = (event: NeatEvent) => ({
  slug: event.slug, title: event.title, hostName: event.hostName, date: event.date,
  mode: event.mode, machineConnected: Boolean(event.machineId),
});
const machineOnline = (lastSeen: string | null) => Boolean(lastSeen && Date.now() - Date.parse(lastSeen) < 45_000);
function eventPlanning(eventId: string) {
  const data = store.snapshot();
  const totals = new Map<string, { name: string; amountMl: number; packageMl: number; drinks: number; category: "alcohol" | "mixer"; machineDispensed: boolean }>();
  const automatic = new Set<string>();
  const manual = new Set<string>();
  for (const request of data.requests.filter((item) => item.eventId === eventId)) {
    const recipe = catalog.find((item) => item.id === request.recipeId);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredientAmounts) {
      const key = ingredient.name.toLocaleLowerCase("en");
      const current = totals.get(key) ?? { name: ingredient.name, amountMl: 0, packageMl: ingredient.packageMl, drinks: 0, category: ingredient.category, machineDispensed: ingredient.machineDispensed };
      current.amountMl += ingredient.amountMl;
      current.drinks += 1;
      totals.set(key, current);
      (ingredient.machineDispensed ? automatic : manual).add(ingredient.name);
    }
  }
  const shoppingList = [...totals.entries()].map(([key, item]) => ({
    key,
    ...item,
    amountMl: Math.ceil(item.amountMl * 1.15),
    packages: Math.max(1, Math.ceil((item.amountMl * 1.15) / item.packageMl)),
  })).sort((a, b) => a.name.localeCompare(b.name));
  return { shoppingList, pumpPlan: { requiredPumps: automatic.size, automaticIngredients: [...automatic].sort(), manualIngredients: [...manual].sort() } };
}
function slugify(value: string) {
  const base = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 34) || "event";
  return `${base}-${randomBytes(2).toString("hex")}`;
}
function sendError(response: Response, status: number, message: string) {
  response.status(status).json({ error: message });
}

app.get("/api/health", (_request, response) => response.json({ status: "ok", time: now() }));
app.get("/api/catalog", (_request, response) => response.json(catalog));

app.post("/api/events", async (request, response) => {
  const title = clean(request.body?.title, 80);
  const hostName = clean(request.body?.hostName, 60);
  if (!title || !hostName) return sendError(response, 400, "Event name and organizer are required");
  const event: NeatEvent = {
    id: randomUUID(), slug: slugify(title), title, hostName, hostToken: token(),
    date: clean(request.body?.date, 30) || null, mode: "planning", machineId: null, createdAt: now(),
  };
  await store.mutate((data) => data.events.push(event));
  response.status(201).json({ event: publicEvent(event), hostToken: event.hostToken });
});

app.get("/api/events/:slug", (request, response) => {
  const event = eventForSlug(request.params.slug);
  if (!event) return sendError(response, 404, "Event not found");
  const data = store.snapshot();
  const machine = data.machines.find((value) => value.id === event.machineId);
  const recipeIds = new Set(machine?.recipeIds ?? []);
  const recipes = catalog.map((recipe) => ({
    ...recipe,
    imageUrl: `/drinks/${recipe.imageKey}.webp`,
    available: event.mode === "planning" || !machine || recipeIds.size === 0 || recipeIds.has(recipe.id),
  }));
  response.json({
    event: { ...publicEvent(event), machineOnline: machineOnline(machine?.lastSeen ?? null) },
    recipes,
  });
});

app.get("/api/events/:slug/mine", (request, response) => {
  const event = eventForSlug(request.params.slug);
  if (!event) return sendError(response, 404, "Event not found");
  const guestToken = request.header("X-Guest-Token");
  if (!guestToken) return response.json({ requests: [], queue: [] });
  const data = store.snapshot();
  response.json({
    requests: data.requests.filter((item) => item.eventId === event.id && item.guestToken === guestToken),
    queue: data.queue.filter((item) => item.eventId === event.id && item.guestToken === guestToken && item.status === "waiting"),
  });
});

app.post("/api/events/:slug/requests", async (request, response) => {
  const event = eventForSlug(request.params.slug);
  if (!event) return sendError(response, 404, "Event not found");
  const guestToken = request.header("X-Guest-Token");
  const guestName = clean(request.body?.guestName, 60);
  const recipeId = clean(request.body?.recipeId, 60) || null;
  const recipe = catalog.find((item) => item.id === recipeId);
  const recipeName = recipe?.name ?? clean(request.body?.recipeName, 80);
  if (!guestToken || !guestName || !recipeName) return sendError(response, 400, "Name, drink and guest token are required");
  const item = { id: randomUUID(), eventId: event.id, guestName, guestToken, recipeId, recipeName, note: clean(request.body?.note, 180) || null, createdAt: now() };
  await store.mutate((data) => data.requests.push(item));
  response.status(201).json(item);
});

app.delete("/api/events/:slug/requests/:id", async (request, response) => {
  const event = eventForSlug(request.params.slug);
  if (!event) return sendError(response, 404, "Event not found");
  const guestToken = request.header("X-Guest-Token");
  const removed = await store.mutate((data) => {
    const index = data.requests.findIndex((item) => item.id === request.params.id && item.eventId === event.id && item.guestToken === guestToken);
    if (index < 0) return false;
    data.requests.splice(index, 1); return true;
  });
  if (!removed) return sendError(response, 404, "Request not found");
  response.status(204).end();
});

app.post("/api/events/:slug/queue", async (request, response) => {
  const event = eventForSlug(request.params.slug);
  if (!event || !event.machineId || event.mode !== "live") return sendError(response, 409, "This event is not connected to a live machine");
  const guestToken = request.header("X-Guest-Token");
  const guestName = clean(request.body?.guestName, 60);
  const recipe = catalog.find((item) => item.id === clean(request.body?.recipeId, 60));
  if (!guestToken || !guestName || !recipe) return sendError(response, 400, "Name, recipe and guest token are required");
  const entry = {
    id: randomUUID(), eventId: event.id, machineId: event.machineId, guestName, guestToken,
    recipeId: recipe.id, machineRecipeId: recipe.machineRecipeId, recipeName: recipe.name,
    sizeMl: [300, 400, 500].includes(Number(request.body?.sizeMl)) ? Number(request.body.sizeMl) : 400,
    strength: ["less", "standard", "more"].includes(request.body?.strength) ? request.body.strength as "less" | "standard" | "more" : "standard",
    status: "waiting" as const, createdAt: now(),
  };
  await store.mutate((data) => data.queue.push(entry));
  broadcast(event.machineId, "queue.created");
  response.status(201).json(entry);
});

app.delete("/api/events/:slug/queue/:id", async (request, response) => {
  const event = eventForSlug(request.params.slug);
  if (!event) return sendError(response, 404, "Event not found");
  const guestToken = request.header("X-Guest-Token");
  const removed = await store.mutate((data) => {
    const index = data.queue.findIndex((item) => item.id === request.params.id && item.eventId === event.id && item.guestToken === guestToken && item.status === "waiting");
    if (index < 0) return false;
    data.queue[index]!.status = "cancelled"; return true;
  });
  if (!removed) return sendError(response, 404, "Queue entry not found");
  if (event.machineId) broadcast(event.machineId, "queue.cancelled");
  response.status(204).end();
});

app.get("/api/events/:slug/host", (request, response) => {
  const event = eventForSlug(request.params.slug);
  if (!event) return sendError(response, 404, "Event not found");
  if (!hostAllowed(request, event)) return sendError(response, 401, "Host token invalid");
  const data = store.snapshot();
  const machine = data.machines.find((item) => item.id === event.machineId);
  const planning = eventPlanning(event.id);
  response.json({
    event: publicEvent(event),
    requests: data.requests.filter((item) => item.eventId === event.id),
    queue: data.queue.filter((item) => item.eventId === event.id && item.status === "waiting"),
    shoppingList: planning.shoppingList,
    pumpPlan: planning.pumpPlan,
    checkedShoppingKeys: event.checkedShoppingKeys ?? [],
    machine: machine ? { id: machine.id, name: machine.name, online: machineOnline(machine.lastSeen), lastSeen: machine.lastSeen } : null,
  });
});

app.delete("/api/events/:slug/host/requests/:id", async (request, response) => {
  const event = eventForSlug(request.params.slug);
  if (!event) return sendError(response, 404, "Event not found");
  if (!hostAllowed(request, event)) return sendError(response, 401, "Host token invalid");
  const removed = await store.mutate((data) => {
    const index = data.requests.findIndex((item) => item.id === request.params.id && item.eventId === event.id);
    if (index < 0) return false;
    data.requests.splice(index, 1);
    return true;
  });
  if (!removed) return sendError(response, 404, "Request not found");
  response.status(204).end();
});

app.put("/api/events/:slug/shopping", async (request, response) => {
  const event = eventForSlug(request.params.slug);
  if (!event) return sendError(response, 404, "Event not found");
  if (!hostAllowed(request, event)) return sendError(response, 401, "Host token invalid");
  const keys: string[] | null = Array.isArray(request.body?.checkedKeys)
    ? (request.body.checkedKeys as unknown[]).map((value) => clean(value, 100)).filter((value): value is string => Boolean(value))
    : null;
  if (!keys) return sendError(response, 400, "checkedKeys must be an array");
  await store.mutate((data) => {
    const item = data.events.find((value) => value.id === event.id);
    if (item) item.checkedShoppingKeys = [...new Set(keys)];
  });
  response.json({ checkedKeys: [...new Set(keys)] });
});

app.put("/api/events/:slug/mode", async (request, response) => {
  const event = eventForSlug(request.params.slug);
  if (!event) return sendError(response, 404, "Event not found");
  if (!hostAllowed(request, event)) return sendError(response, 401, "Host token invalid");
  const mode = request.body?.mode;
  if (mode !== "planning" && mode !== "live") return sendError(response, 400, "Invalid mode");
  await store.mutate((data) => { const item = data.events.find((value) => value.id === event.id); if (item) item.mode = mode; });
  response.json({ ...publicEvent(event), mode });
});

app.post("/api/events/:slug/pairing", async (request, response) => {
  const event = eventForSlug(request.params.slug);
  if (!event) return sendError(response, 404, "Event not found");
  if (!hostAllowed(request, event)) return sendError(response, 401, "Host token invalid");
  const code = String(randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  await store.mutate((data) => {
    data.pairings = data.pairings.filter((item) => item.eventId !== event.id || item.used);
    data.pairings.push({ code, eventId: event.id, expiresAt, used: false });
  });
  response.json({ code, expiresAt });
});

app.post("/api/pairings/:code/claim", async (request, response) => {
  const machineId = clean(request.body?.machineId, 80);
  const name = clean(request.body?.name, 80) || "Neat";
  if (!machineId) return sendError(response, 400, "Machine ID required");
  const result = await store.mutate((data) => {
    const requestedCode = request.params.code.replace(/\D/g, "");
    const pairing = data.pairings.find((item) => item.code === requestedCode && !item.used && Date.parse(item.expiresAt) > Date.now());
    if (!pairing) return null;
    const event = data.events.find((item) => item.id === pairing.eventId);
    if (!event) return null;
    pairing.used = true; event.machineId = machineId;
    let machine = data.machines.find((item) => item.id === machineId);
    if (!machine) { machine = { id: machineId, name, eventId: event.id, lastSeen: now(), recipeIds: [] }; data.machines.push(machine); }
    machine.name = name; machine.eventId = event.id; machine.lastSeen = now();
    return { event: publicEvent(event), machineId };
  });
  if (!result) return sendError(response, 404, "Pairing code invalid or expired");
  response.json(result);
});

app.get("/api/machines/:machineId/public", (request, response) => {
  const machine = store.snapshot().machines.find((item) => item.id === request.params.machineId);
  if (!machine) return sendError(response, 404, "Machine not found");
  const available = new Set(machine.recipeIds);
  response.json({
    machine: { id: machine.id, name: machine.name, online: machineOnline(machine.lastSeen) },
    recipes: catalog.map((recipe) => ({
      ...recipe,
      imageUrl: `${publicOrigin}/drinks/${recipe.imageKey}.webp`,
      available: available.size === 0 || available.has(recipe.id),
    })),
  });
});

app.get("/api/machines/:machineId/mine", (request, response) => {
  const guestToken = request.header("X-Guest-Token");
  response.json({ queue: guestToken ? store.snapshot().queue.filter((item) =>
    item.machineId === request.params.machineId && item.guestToken === guestToken && item.status === "waiting") : [] });
});

app.post("/api/machines/:machineId/queue", async (request, response) => {
  const machine = store.snapshot().machines.find((item) => item.id === request.params.machineId);
  if (!machine || !machineOnline(machine.lastSeen)) return sendError(response, 409, "Machine is offline");
  const guestToken = request.header("X-Guest-Token");
  const guestName = clean(request.body?.guestName, 60);
  const recipe = catalog.find((item) => item.id === clean(request.body?.recipeId, 60));
  const available = new Set(machine.recipeIds);
  if (!guestToken || !guestName || !recipe) return sendError(response, 400, "Name, recipe and guest token are required");
  if (available.size && !available.has(recipe.id)) return sendError(response, 409, "Recipe unavailable on this machine");
  const entry = { id: randomUUID(), eventId: machine.eventId ?? "", machineId: machine.id, guestName, guestToken,
    recipeId: recipe.id, machineRecipeId: recipe.machineRecipeId, recipeName: recipe.name, sizeMl: 400,
    strength: "standard" as const, status: "waiting" as const, createdAt: now() };
  await store.mutate((data) => data.queue.push(entry));
  broadcast(machine.id, "queue.created");
  response.status(201).json(entry);
});

app.delete("/api/machines/:machineId/queue/:id", async (request, response) => {
  const guestToken = request.header("X-Guest-Token");
  const removed = await store.mutate((data) => {
    const item = data.queue.find((value) => value.id === request.params.id && value.machineId === request.params.machineId && value.guestToken === guestToken && value.status === "waiting");
    if (!item) return false;
    item.status = "cancelled";
    return true;
  });
  if (!removed) return sendError(response, 404, "Queue entry not found");
  broadcast(request.params.machineId, "queue.cancelled");
  response.status(204).end();
});

app.get("/api/events/:slug/export", async (request, response) => {
  const event = eventForSlug(request.params.slug);
  if (!event) return sendError(response, 404, "Event not found");
  if (!hostAllowed(request, event)) return sendError(response, 401, "Host token invalid");
  const data = store.snapshot();
  const requests = data.requests.filter((item) => item.eventId === event.id);
  const wantedIds = new Set(requests.map((item) => item.recipeId).filter(Boolean));
  const recipes = await Promise.all(catalog.filter((item) => wantedIds.has(item.id)).map(async (item) => {
    const image = await readFile(new URL(`../assets/drinks/${item.imageKey}.webp`, import.meta.url));
    return { ...item, imageUrl: `${publicOrigin}/drinks/${item.imageKey}.webp`, imageData: `data:image/webp;base64,${image.toString("base64")}` };
  }));
  response.setHeader("Content-Disposition", `attachment; filename="${event.slug}.neatpack.json"`);
  response.json({ format: "neat-event-pack", version: 1, exportedAt: now(), event: publicEvent(event), requests: requests.map(({ guestToken: _guestToken, ...item }) => item), recipes });
});

app.get("/v1/machines/:machineId", (request, response) => {
  const data = store.snapshot();
  const machine = data.machines.find((item) => item.id === request.params.machineId);
  const event = data.events.find((item) => item.id === machine?.eventId);
  if (!machine) return sendError(response, 404, "Machine not paired");
  response.json({ id: machine.id, name: machine.name, online: machineOnline(machine.lastSeen), mode: event?.mode ?? "planning", partyId: event?.slug ?? null, partyName: event?.title ?? null, location: null, startsAt: event?.date ?? null });
});
app.get("/v1/machines/:machineId/recipes", (request, response) => {
  const machine = store.snapshot().machines.find((item) => item.id === request.params.machineId);
  if (!machine) return sendError(response, 404, "Machine not paired");
  const available = new Set(machine.recipeIds);
  response.json(catalog.map((recipe) => ({ id: recipe.id, machineRecipeId: recipe.machineRecipeId, name: recipe.name, subtitle: recipe.subtitle, description: recipe.description, imageKey: recipe.imageKey, imageUrl: `${publicOrigin}/drinks/${recipe.imageKey}.webp`, available: available.size === 0 || available.has(recipe.id) })));
});
app.get("/v1/machines/:machineId/queue", (request, response) => {
  response.json(store.snapshot().queue.filter((item) => item.machineId === request.params.machineId && item.status === "waiting"));
});
app.post("/v1/machines/:machineId/queue/:entryId/claim", async (request, response) => {
  const entry = await store.mutate((data) => {
    const item = data.queue.find((value) => value.id === request.params.entryId && value.machineId === request.params.machineId && value.status === "waiting");
    if (item) item.status = "claimed";
    return item ?? null;
  });
  if (!entry) return sendError(response, 404, "Queue entry not found");
  broadcast(request.params.machineId, "queue.claimed"); response.json(entry);
});
app.post("/v1/machines/:machineId/heartbeat", async (request, response) => {
  const machine = await store.mutate((data) => {
    let item = data.machines.find((value) => value.id === request.params.machineId);
    if (!item) { item = { id: request.params.machineId, name: "Neat", eventId: null, lastSeen: now(), recipeIds: [] }; data.machines.push(item); }
    item.lastSeen = now();
    const ids = Array.isArray(request.body?.recipeIds) ? request.body.recipeIds.map((id: unknown) => clean(id, 60)).filter(Boolean) : null;
    if (ids) item.recipeIds = ids;
    return item;
  });
  response.json({ ok: true, paired: Boolean(machine.eventId), publicQueueUrl: `${publicOrigin}/m/${encodeURIComponent(machine.id)}` });
});
app.post("/v1/machines/:machineId/sync", async (request, response) => {
  const ids = Array.isArray(request.body?.recipeIds) ? request.body.recipeIds.map((id: unknown) => clean(id, 60)).filter(Boolean) : [];
  const machine = await store.mutate((data) => {
    const item = data.machines.find((value) => value.id === request.params.machineId);
    if (!item) return null;
    item.recipeIds = ids; item.lastSeen = now(); return item;
  });
  if (!machine) return sendError(response, 404, "Machine not paired");
  const requestedRecipeIds = machine.eventId
    ? [...new Set(store.snapshot().requests.filter((item) => item.eventId === machine.eventId && item.recipeId).map((item) => item.recipeId as string))]
    : [];
  response.json({ recipes: catalog, requestedRecipeIds, eventId: machine.eventId });
});
app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  response.status(500).json({ error: "Unexpected server error" });
});

const server = createServer(app);
const sockets = new Map<string, Set<WebSocket>>();
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (request, socket, head) => {
  const match = request.url?.match(/^\/v1\/machines\/([^/]+)\/events$/);
  if (!match?.[1]) return socket.destroy();
  const machineId = decodeURIComponent(match[1]);
  wss.handleUpgrade(request, socket, head, (client) => {
    const clients = sockets.get(machineId) ?? new Set<WebSocket>();
    clients.add(client); sockets.set(machineId, clients);
    client.on("close", () => { clients.delete(client); if (!clients.size) sockets.delete(machineId); });
    client.send(JSON.stringify({ type: "connected" }));
  });
});
function broadcast(machineId: string, type: string) {
  for (const client of sockets.get(machineId) ?? []) if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type }));
}
server.listen(port, "0.0.0.0", () => console.log(`Neat cloud API listening on ${port}`));
