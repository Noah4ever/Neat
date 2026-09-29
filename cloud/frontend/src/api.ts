import type { EventData, HostData, QueueEntry } from "./types";

const API = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
const guestKey = (slug: string) => `neat.guest.${slug}`;
const hostKey = (slug: string) => `neat.host.${slug}`;

export function guestToken(slug: string) {
  let value = localStorage.getItem(guestKey(slug));
  if (!value) {
    const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16));
    value = typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : bytes ? [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(guestKey(slug), value);
  }
  return value;
}
export const getHostToken = (slug: string) => localStorage.getItem(hostKey(slug)) ?? "";
export const saveHostToken = (slug: string, value: string) => localStorage.setItem(hostKey(slug), value);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed" })) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const createEvent = (body: { title: string; hostName: string; date: string | null }) =>
  request<{ event: EventData["event"]; hostToken: string }>("/api/events", { method: "POST", body: JSON.stringify(body) });
export const getEvent = (slug: string) => request<EventData>(`/api/events/${encodeURIComponent(slug)}`);
export const getMine = (slug: string) => request<{ requests: HostData["requests"]; queue: QueueEntry[] }>(`/api/events/${encodeURIComponent(slug)}/mine`, { headers: { "X-Guest-Token": guestToken(slug) } });
export const addRequest = (slug: string, body: object) => request<HostData["requests"][number]>(`/api/events/${encodeURIComponent(slug)}/requests`, { method: "POST", headers: { "X-Guest-Token": guestToken(slug) }, body: JSON.stringify(body) });
export const removeRequest = (slug: string, id: string) => request<void>(`/api/events/${encodeURIComponent(slug)}/requests/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "X-Guest-Token": guestToken(slug) } });
export const addQueue = (slug: string, body: object) => request<QueueEntry>(`/api/events/${encodeURIComponent(slug)}/queue`, { method: "POST", headers: { "X-Guest-Token": guestToken(slug) }, body: JSON.stringify(body) });
export const removeQueue = (slug: string, id: string) => request<void>(`/api/events/${encodeURIComponent(slug)}/queue/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "X-Guest-Token": guestToken(slug) } });
export const getHost = (slug: string) => request<HostData>(`/api/events/${encodeURIComponent(slug)}/host`, { headers: { "X-Host-Token": getHostToken(slug) } });
export const hostRemoveRequest = (slug: string, id: string) => request<void>(`/api/events/${encodeURIComponent(slug)}/host/requests/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "X-Host-Token": getHostToken(slug) } });
export const createPairing = (slug: string) => request<{ code: string; expiresAt: string }>(`/api/events/${encodeURIComponent(slug)}/pairing`, { method: "POST", headers: { "X-Host-Token": getHostToken(slug) } });
export const setMode = (slug: string, mode: "planning" | "live") => request(`/api/events/${encodeURIComponent(slug)}/mode`, { method: "PUT", headers: { "X-Host-Token": getHostToken(slug) }, body: JSON.stringify({ mode }) });
export const updateShopping = (slug: string, checkedKeys: string[]) => request<{ checkedKeys: string[] }>(`/api/events/${encodeURIComponent(slug)}/shopping`, { method: "PUT", headers: { "X-Host-Token": getHostToken(slug) }, body: JSON.stringify({ checkedKeys }) });
export const getMachinePublic = (machineId: string) => request<{ machine: { id: string; name: string; online: boolean }; recipes: EventData["recipes"] }>(`/api/machines/${encodeURIComponent(machineId)}/public`);
export const getMachineMine = (machineId: string) => request<{ queue: QueueEntry[] }>(`/api/machines/${encodeURIComponent(machineId)}/mine`, { headers: { "X-Guest-Token": guestToken(`machine.${machineId}`) } });
export const addMachineQueue = (machineId: string, body: object) => request<QueueEntry>(`/api/machines/${encodeURIComponent(machineId)}/queue`, { method: "POST", headers: { "X-Guest-Token": guestToken(`machine.${machineId}`) }, body: JSON.stringify(body) });
export const removeMachineQueue = (machineId: string, id: string) => request<void>(`/api/machines/${encodeURIComponent(machineId)}/queue/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "X-Guest-Token": guestToken(`machine.${machineId}`) } });
export async function downloadPack(slug: string) {
  const response = await fetch(`${API}/api/events/${encodeURIComponent(slug)}/export`, { headers: { "X-Host-Token": getHostToken(slug) } });
  if (!response.ok) throw new Error("Could not create offline pack");
  const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `${slug}.neatpack.json`; link.click(); URL.revokeObjectURL(url);
}
