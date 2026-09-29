import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Cloud, RotateCw, Wifi } from "lucide-react";
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
  testInternetConnection,
  updateDeviceSettings,
} from "../services/api";
import { getCloudConfig, pairCloudMachine } from "../services/cloud";
import { showApiError } from "../services/notifications";
import type { DeviceSettings } from "../types/device";
import { useDeveloperMode } from "../state/developerModeContext";
import { getLanguage, setLanguage, tr } from "../services/language";

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
  const navigate = useNavigate();
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth });
  const settings = useQuery({
    queryKey: ["device-settings"],
    queryFn: getDeviceSettings,
  });
  const [localDraft, setDraft] = useState<DeviceSettings | null>(null);
  const [pairCode, setPairCode] = useState("");
  const [internetWarning, setInternetWarning] = useState(false);
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
  const cloud = getCloudConfig();
  const pair = useMutation({
    mutationFn: async () => {
      const connection = await testInternetConnection();
      if (!connection.reachable) {
        setInternetWarning(true);
        throw new Error("internet_required");
      }
      return pairCloudMachine(pairCode);
    },
    onSuccess: (result) => {
      setPairCode("");
      void cache.invalidateQueries({ queryKey: ["recipes"] });
      void cache.invalidateQueries({ queryKey: ["ingredients"] });
      toast.success(result.importedRecipes ? `Connected and added ${result.importedRecipes} requested recipe${result.importedRecipes === 1 ? "" : "s"}` : "Neat connected to the event");
    },
    onError: (reason) => {
      if (reason instanceof Error && reason.message === "internet_required") return;
      showApiError(reason);
    },
  });

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
        title={tr("Settings", "Einstellungen")}
        subtitle={tr("The everyday behavior of your Neat machine.", "Das tägliche Verhalten deiner Neat-Maschine.")}
      />
      {!draft ? (
        <QueryMessage query={settings} />
      ) : (
        <>
          <SettingsGroup>
            <div className="settings-row"><span className="settings-row__copy"><strong>{tr("Language", "Sprache")}</strong><small>{tr("Language for the main interface and navigation.", "Sprache der Hauptansicht und Navigation.")}</small></span><select className="compact-select" aria-label="Language" value={getLanguage()} onChange={(event) => setLanguage(event.target.value as "en" | "de")}><option value="en">English</option><option value="de">Deutsch</option></select></div>
            <div className="settings-row">
              <span className="settings-row__copy">
                <strong>{tr("Full screen", "Vollbild")}</strong>
                <small>{tr("Use the whole display for Neat.", "Den gesamten Bildschirm für Neat verwenden.")}</small>
              </span>
              <FullscreenButton />
            </div>
            <div className="settings-row">
              <span className="settings-row__copy">
                <strong>{tr("Refresh application", "App neu laden")}</strong>
                <small>{tr("Reload Neat without leaving the Home Screen app.", "Neat neu laden, ohne die Home-Screen-App zu verlassen.")}</small>
              </span>
              <button
                className="compact-action reload-application"
                onClick={() => window.location.reload()}
                type="button"
              >
                <RotateCw size={18} />
                {tr("Reload", "Neu laden")}
              </button>
            </div>
            <SettingsToggleRow
              label={tr("Glass detection", "Glaserkennung")}
              description={tr("Pause dispensing if the glass is removed. Turn this off for paper cups the sensor cannot detect.", "Pausiert beim Entfernen des Glases. Für nicht erkennbare Pappbecher ausschalten.")}
              checked={draft.requireGlassDetection}
              onChange={() =>
                setDraft({
                  ...draft,
                  requireGlassDetection: !draft.requireGlassDetection,
                })
              }
            />
            <SettingsToggleRow
              label={tr("Active pump LEDs", "Aktive Pumpen beleuchten")}
              description={tr("Light the bottles that are dispensing.", "Beleuchtet Flaschen, aus denen gerade ausgeschenkt wird.")}
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
                <strong>{tr("Default drink size", "Standardgröße")}</strong>
                <small>{tr("Preselected when someone chooses a cocktail.", "Wird bei der Cocktailauswahl vorausgewählt.")}</small>
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
          <h2 className="settings-section-label">Neat event</h2>
          <SettingsGroup>
            <div className="settings-row cloud-pair-row">
              <Cloud className="settings-row__icon" size={20} />
              <span className="settings-row__copy">
                <strong>Connect to a Neat event</strong>
                <small>{(device.data?.id ?? cloud.machineId) ? `This machine · ${device.data?.id ?? cloud.machineId}` : "Enter the six-digit code shown on the event page."}</small>
              </span>
              <form onSubmit={(event) => { event.preventDefault(); pair.mutate(); }}>
                <input aria-label="Pairing code" inputMode="numeric" maxLength={6} onChange={(event) => setPairCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" value={pairCode} />
                <button className="compact-action" disabled={pair.isPending || pairCode.length !== 6}>{pair.isPending ? "Checking…" : "Connect"}</button>
              </form>
            </div>
          </SettingsGroup>
          <button
            className="primary-button settings-save-button"
            disabled={save.isPending}
            onClick={() => save.mutate(draft)}
          >
            {save.isPending ? tr("Saving…", "Speichern…") : tr("Save settings", "Einstellungen speichern")}
          </button>
        </>
      )}
      <Modal open={internetWarning} onOpenChange={setInternetWarning} title="Internet connection required" description="Pairing connects this Neat machine to the online event. Connect Neat to Wi-Fi first. If the venue has no internet, download the offline event pack on the event website and import it from the queue screen.">
        <button className="primary-button" onClick={() => navigate("/settings/network")} type="button"><Wifi size={18} /> Connect to Wi-Fi</button>
        <button className="secondary-button" onClick={() => setInternetWarning(false)} type="button">Use an offline pack instead</button>
      </Modal>
    </div>
  );
}
