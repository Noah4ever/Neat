import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FullscreenButton } from "../components/FullscreenButton";
import { Modal } from "../components/Modal";
import {
  PageHeading,
  SettingsGroup,
  SettingsRow,
} from "../components/SettingsPrimitives";
import { QueryMessage } from "../components/QueryMessage";
import {
  getDevice,
  getDeviceSettings,
  getHealth,
  restartDevice,
  updateDeviceSettings,
} from "../services/api";
import { useDrinkSession } from "../state/useDrinkSession";
import { showApiError } from "../services/notifications";
export function GeneralSettingsPage({
  page = "general",
}: {
  page?: "general" | "display" | "about";
}) {
  const device = useQuery({ queryKey: ["device"], queryFn: getDevice });
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth });
  const settings = useQuery({
    queryKey: ["device-settings"],
    queryFn: getDeviceSettings,
  });
  const cache = useQueryClient();
  const { busy } = useDrinkSession();
  const [confirm, setConfirm] = useState(false);
  const restart = useMutation({
    mutationFn: restartDevice,
    onSuccess: () => {
      setConfirm(false);
      toast.success("Restart requested");
    },
    onError: showApiError,
  });
  const saveSettings = useMutation({
    mutationFn: updateDeviceSettings,
    onSuccess: () =>
      void cache.invalidateQueries({ queryKey: ["device-settings"] }),
    onError: showApiError,
  });
  return (
    <div className="settings-page">
      <PageHeading
        title={
          page === "general"
            ? "Settings"
            : page === "display"
              ? "Display"
              : "About"
        }
        subtitle={
          page === "display"
            ? "Make Neat feel at home on this screen."
            : "Your machine, at a glance."
        }
      />
      {page !== "display" &&
        (!device.data ? (
          <QueryMessage query={device} />
        ) : (
          <SettingsGroup>
            <SettingsRow title="Machine" value={device.data.name} />
            <SettingsRow title="Model" value={device.data.model} />
            <SettingsRow title="Firmware" value={device.data.version} />
            <SettingsRow
              title="Connection"
              value={health.data?.status ?? "Checking…"}
            />
          </SettingsGroup>
        ))}
      {page !== "about" && (
        <section className="settings-card">
          <h2>Full screen</h2>
          <p>Keep the focus on your drinks.</p>
          <FullscreenButton />
          <p className="muted">
            On iPhone or iPad, you can also use Safari → Share → Add to Home
            Screen, then open Neat from its icon.
          </p>
        </section>
      )}
      {page === "general" && settings.data && (
        <SettingsGroup>
          <div className="settings-row">
            <span className="settings-row__copy">
              <strong>Activate LEDs while pumps are running</strong>
              <small>Show which bottles are currently dispensing.</small>
            </span>
            <button
              type="button"
              className="toggle-control"
              role="switch"
              aria-checked={settings.data.activateLedWhenPumpActive}
              aria-label="Activate LEDs while pumps are running"
              disabled={saveSettings.isPending}
              onClick={() =>
                saveSettings.mutate({
                  activateLedWhenPumpActive:
                    !settings.data.activateLedWhenPumpActive,
                })
              }
            >
              <span />
            </button>
          </div>
        </SettingsGroup>
      )}
      {page === "general" && settings.error && (
        <QueryMessage query={settings} />
      )}
      {page === "general" && (
        <button
          className="danger-button"
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          Restart machine
        </button>
      )}
      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title="Restart Neat?"
        description="The machine will briefly disconnect while it restarts."
      >
        <div className="button-row">
          <button
            className="secondary-button"
            onClick={() => setConfirm(false)}
          >
            Cancel
          </button>
          <button
            className="danger-button"
            disabled={busy || restart.isPending}
            onClick={() => restart.mutate()}
          >
            Restart
          </button>
        </div>
      </Modal>
    </div>
  );
}
