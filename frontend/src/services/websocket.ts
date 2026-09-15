import { USE_MOCK_API } from "./api";
import { subscribeToMockMachineEvents } from "./mockEvents";
import type { SystemStatus } from "../types/device";
import { mockMediaUsedBytes } from "./mockMedia";

export type MachineEvent =
  | { type: "machine_error"; error: "glass_removed" }
  | {
      type: "machine_warning";
      warning: "bottle_may_be_empty";
      pumpId: number;
    }
  | { type: "wifi_scan_done"; networks: unknown[] }
  | { type: "system_status"; status: SystemStatus };

export function createMachineWebSocket(onEvent: (event: MachineEvent) => void) {
  if (USE_MOCK_API) {
    const unsubscribe = subscribeToMockMachineEvents(onEvent);
    const started = performance.now();
    const interval = window.setInterval(() => {
      const uptimeMs = Math.floor(performance.now());
      onEvent({
        type: "system_status",
        status: {
          uptimeMs,
          memory: {
            freeHeapBytes: 226000 - Math.floor((uptimeMs / 1000) % 4000),
            minimumFreeHeapBytes: 211200,
            largestFreeBlockBytes: 131072,
          },
          cpu: {
            utilizationPercent:
              8 +
              Math.round(Math.sin((performance.now() - started) / 4000) * 3),
          },
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
        },
      });
    }, 1000);
    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }

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
