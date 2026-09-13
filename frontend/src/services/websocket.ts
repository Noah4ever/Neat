export interface MachineStatusEvent {
  type: "machine_status";
  status: "ready" | "busy" | "error";
}

export type MachineEvent = MachineStatusEvent | { type: string };

export function createMachineWebSocket(onEvent: (event: MachineEvent) => void) {
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
