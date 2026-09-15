import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FullscreenButton } from "../components/FullscreenButton";
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
  updateDeviceSettings,
} from "../services/api";
import { showApiError } from "../services/notifications";
import type { DeviceSettings } from "../types/device";
import { useDeveloperMode } from "../state/developerModeContext";

function SettingsToggleRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      className="settings-row settings-toggle-row"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
    >
      <span className="settings-row__copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="toggle-control" aria-hidden="true">
        <span />
      </span>
    </button>
  );
}

export function GeneralSettingsPage({
  page = "general",
}: {
  page?: "general" | "about";
}) {
  const device = useQuery({ queryKey: ["device"], queryFn: getDevice });
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth });
  const settings = useQuery({
    queryKey: ["device-settings"],
    queryFn: getDeviceSettings,
  });
  const [localDraft, setDraft] = useState<DeviceSettings | null>(null);
  const cache = useQueryClient();
  const { enabled: developerEnabled, enable: enableDeveloper } =
    useDeveloperMode();
  const taps = useRef<number[]>([]);
  const save = useMutation({
    mutationFn: updateDeviceSettings,
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["device-settings"] });
      toast.success("Settings saved");
    },
    onError: showApiError,
  });
  const draft = localDraft ?? settings.data ?? null;

  if (page === "about") {
    return (
      <div className="settings-page">
        <PageHeading
          title="About"
          subtitle="Information about this Neat machine."
          onTitleClick={() => {
            const now = Date.now();
            taps.current = [
              ...taps.current.filter((value) => now - value < 3000),
              now,
            ];
            if (taps.current.length >= 5 && !developerEnabled) {
              enableDeveloper();
              taps.current = [];
              toast.success("Developer settings enabled");
            }
          }}
        />
        {!device.data ? (
          <QueryMessage query={device} />
        ) : (
          <SettingsGroup>
            <SettingsRow title="Machine" value={device.data.name} />
            <SettingsRow title="Model" value={device.data.model} />
            <SettingsRow title="Firmware" value={device.data.version} />
            <SettingsRow
              title="Connection"
              value={health.data?.status === "ok" ? "Connected" : "Checking…"}
            />
          </SettingsGroup>
        )}
      </div>
    );
  }

  return (
    <div className="settings-page">
      <PageHeading
        title="Settings"
        subtitle="The everyday behavior of your Neat machine."
      />
      {!draft ? (
        <QueryMessage query={settings} />
      ) : (
        <>
          <SettingsGroup>
            <div className="settings-row">
              <span className="settings-row__copy">
                <strong>Full screen</strong>
                <small>Use the whole display for Neat.</small>
              </span>
              <FullscreenButton />
            </div>
            <SettingsToggleRow
              label="Glass detection"
              description="Pause dispensing if the glass is removed. Turn this off for paper cups the sensor cannot detect."
              checked={draft.requireGlassDetection}
              onChange={() =>
                setDraft({
                  ...draft,
                  requireGlassDetection: !draft.requireGlassDetection,
                })
              }
            />
            <SettingsToggleRow
              label="Active pump LEDs"
              description="Light the bottles that are dispensing."
              checked={draft.activateLedWhenPumpActive}
              onChange={() =>
                setDraft({
                  ...draft,
                  activateLedWhenPumpActive:
                    !draft.activateLedWhenPumpActive,
                })
              }
            />
            <div className="settings-row">
              <span className="settings-row__copy">
                <strong>Default drink size</strong>
                <small>Preselected when someone chooses a cocktail.</small>
              </span>
              <select
                className="compact-select"
                aria-label="Default drink size"
                value={draft.defaultDrinkSizeMl}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    defaultDrinkSizeMl: Number(event.target.value),
                  })
                }
              >
                {draft.drinkSizesMl.map((size) => (
                  <option key={size} value={size}>
                    {size} ml
                  </option>
                ))}
              </select>
            </div>
          </SettingsGroup>
          <button
            className="primary-button settings-save-button"
            disabled={save.isPending}
            onClick={() => save.mutate(draft)}
          >
            {save.isPending ? "Saving…" : "Save settings"}
          </button>
        </>
      )}
    </div>
  );
}
