import { toast } from "sonner";
import { ApiError, messageForError } from "./errors";
import type { MachineEvent } from "./websocket";

function displayApiError(error: unknown, retry?: () => void) {
  const notice = messageForError(error);
  toast.error(notice.title, {
    description: notice.message,
    action:
      error instanceof ApiError && error.key === "no_glass" && retry
        ? { label: "Try again", onClick: retry }
        : undefined,
  });
}

export function showApiError(error: unknown) {
  displayApiError(error);
}

export function showApiErrorWithRetry(error: unknown, retry: () => void) {
  displayApiError(error, retry);
}

export function showMachineEvent(event: MachineEvent) {
  if (event.type === "machine_error") {
    showApiError(new ApiError(0, event.error));
    return;
  }
  if (event.type === "machine_warning") {
    toast.warning("Bottle may be empty", {
      description: `The estimated contents for pump ${event.pumpId} have reached zero.`,
    });
  }
}
