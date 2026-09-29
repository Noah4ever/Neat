import { useState } from "react";
import { Cloud, Copy, ExternalLink, Save } from "lucide-react";
import { toast } from "sonner";
import {
  getCloudConfig,
  saveCloudConfig,
} from "../services/cloud";
import type { CloudConfig } from "../types/cloud";
import { copyText } from "../services/id";

const cloudRoutes = [
  "GET  /v1/machines/{machineId}",
  "GET  /v1/machines/{machineId}/recipes",
  "GET  /v1/machines/{machineId}/queue",
  "POST /v1/machines/{machineId}/queue/{entryId}/claim",
  "POST /v1/machines/{machineId}/heartbeat",
  "WS    /v1/machines/{machineId}/events",
  "POST /api/pairings/{code}/claim",
  "POST /v1/machines/{machineId}/sync",
];

export function CloudIntegrationCard() {
  const [value, setValue] = useState<CloudConfig>(getCloudConfig);
  const [saved, setSaved] = useState(getCloudConfig);
  const update = (key: keyof CloudConfig, next: string) =>
    setValue((current) => ({ ...current, [key]: next }));
  const publicSite = saved.publicSiteUrl;

  return (
    <section className="settings-card cloud-integration-card">
      <div className="section-heading">
        <div>
          <h2>Neat Cloud</h2>
          <p className="muted">
            Public event links and the guest queue. The machine needs internet
            access for this feature.
          </p>
        </div>
        <Cloud />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = saveCloudConfig(value);
          setValue(next);
          setSaved(next);
          toast.success("Cloud settings saved");
        }}
      >
        <div className="cloud-config-grid">
          <label>
            Machine ID
            <input
              autoCapitalize="none"
              onChange={(event) => update("machineId", event.target.value)}
              placeholder="neat-berlin-01"
              required
              value={value.machineId}
            />
            <small>Stable ID used in every public party link.</small>
          </label>
          <label>
            Public website
            <input
              inputMode="url"
              onChange={(event) => update("publicSiteUrl", event.target.value)}
              required
              type="url"
              value={value.publicSiteUrl}
            />
          </label>
          <label>
            External REST API
            <input
              inputMode="url"
              onChange={(event) => update("restBaseUrl", event.target.value)}
              required
              type="url"
              value={value.restBaseUrl}
            />
          </label>
          <label>
            External WebSocket
            <input
              inputMode="url"
              onChange={(event) => update("websocketUrl", event.target.value)}
              required
              type="url"
              value={value.websocketUrl}
            />
          </label>
        </div>
        <div className="cloud-config-actions">
          <button className="primary-button" type="submit">
            <Save size={18} /> Save cloud settings
          </button>
          {publicSite && (
            <button
              className="secondary-button"
              onClick={async () => {
                try {
                  await copyText(publicSite);
                  toast.success("Public website copied");
                } catch {
                  toast.error("Could not copy the address");
                }
              }}
              type="button"
            >
              <Copy size={18} /> Copy website
            </button>
          )}
          {publicSite && (
            <a
              className="secondary-button"
              href={publicSite}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink size={18} /> Open public website
            </a>
          )}
        </div>
      </form>
      <details className="cloud-contract">
        <summary>Required cloud routes</summary>
        <p>
          Full payloads, authentication boundaries and sync behavior are in
          <code> docs/cloud-api.md</code>.
        </p>
        <div>
          {cloudRoutes.map((route) => (
            <code key={route}>{route}</code>
          ))}
        </div>
      </details>
    </section>
  );
}
