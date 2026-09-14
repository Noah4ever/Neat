import { USE_MOCK_API } from "./api";
import { subscribeToMockMachineEvents } from "./mockEvents";

export type MachineEvent =
  | { type: "machine_error"; error: "glass_removed" }
  | {
      type: "machine_warning";
      warning: "bottle_may_be_empty";
      pumpId: number;
    }
  | { type: "wifi_scan_done"; networks: unknown[] };

export function createMachineWebSocket(onEvent: (event: MachineEvent) => void) {
  if (USE_MOCK_API) return subscribeToMockMachineEvents(onEvent);

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

  socket.addEventListener("message", (message) => {
    try {
      const event = JSON.parse(String(message.data)) as MachineEvent;
      if (event && typeof event.type === "string") {
        onEvent(event);
      }
    } catch {
      // Ignore non-JSON messages until the real event contract is connected.
    }
  });

  return () => socket.close();
}
