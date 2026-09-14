import type { MachineEvent } from "./websocket";

const listeners = new Set<(event: MachineEvent) => void>();

export function emitMockMachineEvent(event: MachineEvent) {
  for (const listener of listeners) listener(event);
}

export function subscribeToMockMachineEvents(
  listener: (event: MachineEvent) => void,
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
