import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Cpu, Database, HardDrive, MemoryStick, Power, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../components/Modal";
import { PageHeading } from "../components/SettingsPrimitives";
import { QueryMessage } from "../components/QueryMessage";
import { getDevice, getSystemStatus, restartDevice } from "../services/api";
import { showApiError } from "../services/notifications";
import { createMachineWebSocket } from "../services/websocket";
import type { StorageArea, SystemStatus } from "../types/device";
const bytes = (value: number) =>
  value >= 1048576
    ? `${(value / 1048576).toFixed(1)} MB`
    : `${Math.round(value / 1024)} KB`;
const duration = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days && `${days}d`, hours && `${hours}h`, `${minutes}m`]
    .filter(Boolean)
    .join(" ");
};
function StorageMeter({ label, value }: { label: string; value: StorageArea }) {
  const percent = value.totalBytes
    ? Math.min(100, (value.usedBytes / value.totalBytes) * 100)
    : 0;
  return (
    <div className="storage-meter">
      <span>
        <strong>{label}</strong>
        <small>
          {bytes(value.usedBytes)} used ·{" "}
          {bytes(Math.max(0, value.totalBytes - value.usedBytes))} free
        </small>
      </span>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
export function SystemOverviewPage() {
  const [confirmRestart, setConfirmRestart] = useState(false);
  const restart = useMutation({
    mutationFn: restartDevice,
    onSuccess: () => {
      setConfirmRestart(false);
      toast.success("Restart requested");
    },
    onError: showApiError,
  });
  const query = useQuery({
    queryKey: ["system-status"],
    queryFn: getSystemStatus,
  });
  const device = useQuery({ queryKey: ["device"], queryFn: getDevice });
  const [liveStatus, setLiveStatus] = useState<SystemStatus | null>(null);
  const status = liveStatus ?? query.data ?? null;
  useEffect(
    () =>
      createMachineWebSocket((event) => {
        if (event.type === "system_status") setLiveStatus(event.status);
      }),
    [],
  );
  if (!status)
    return (
      <div className="settings-page">
        <PageHeading
          title="System"
          subtitle="Live health and storage information."
        />
        <QueryMessage query={query} />
      </div>
    );
  return (
    <div className="settings-page">
      <PageHeading
        title="System"
        subtitle="Live health and storage information."
      />
      <div className="system-hero">
        <div>
          <span className="system-live-dot" />
          <small>Live</small>
          <h2>{device.data?.model ?? "Neat"}</h2>
          <p>
            Firmware {device.data?.version ?? "—"} · Up for{" "}
            {duration(status.uptimeMs)}
          </p>
        </div>
        <strong>
          {Math.round(status.cpu.utilizationPercent)}
          <small>% CPU</small>
        </strong>
      </div>
      <div className="system-stat-grid">
        <article>
          <MemoryStick />
          <span>
            <small>Free memory</small>
            <strong>{bytes(status.memory.freeHeapBytes)}</strong>
            <small>{bytes(status.memory.minimumFreeHeapBytes)} minimum</small>
          </span>
        </article>
        <article>
          <Cpu />
          <span>
            <small>Largest free block</small>
            <strong>{bytes(status.memory.largestFreeBlockBytes)}</strong>
          </span>
        </article>
        <article>
          <Wifi />
          <span>
            <small>Wi-Fi</small>
            <strong>
              {status.network.stationConnected ? "Connected" : "Disconnected"}
            </strong>
            <small>
              {status.network.rssi === null
                ? status.network.mode
                : `${status.network.rssi} dBm · ${status.network.mode}`}
            </small>
          </span>
        </article>
      </div>
      <section className="settings-card">
        <div className="section-heading">
          <div>
            <h2>Storage</h2>
            <p className="muted">Each flash area is measured separately.</p>
          </div>
          <Database />
        </div>
        <div className="storage-list">
          <StorageMeter
            label="Firmware / App"
            value={status.storage.firmware}
          />
          <StorageMeter label="Frontend" value={status.storage.frontend} />
          <StorageMeter
            label="Configuration"
            value={status.storage.configuration}
          />
          <StorageMeter label="Uploaded media" value={status.storage.media} />
        </div>
      </section>
      <section className="settings-card">
        <div className="section-heading">
          <div>
            <h2>Network</h2>
            <p className="muted">Current ESP32 radio state.</p>
          </div>
          <HardDrive />
        </div>
        <div className="system-network">
          <span>
            <small>Mode</small>
            <strong>{status.network.mode}</strong>
          </span>
          <span>
            <small>Station</small>
            <strong>
              {status.network.stationConnected ? "Connected" : "Disconnected"}
            </strong>
          </span>
          <span>
            <small>Access point</small>
            <strong>
              {status.network.accessPointActive ? "Active" : "Off"}
            </strong>
          </span>
        </div>
      </section>
      <section className="settings-group system-actions">
        <button
          className="settings-row settings-row--danger"
          onClick={() => setConfirmRestart(true)}
          type="button"
        >
          <Power className="settings-row__icon" size={20} />
          <span className="settings-row__copy">
            <strong>Restart machine</strong>
            <small>Restart the controller and reconnect automatically.</small>
          </span>
        </button>
      </section>
      <Modal
        open={confirmRestart}
        onOpenChange={setConfirmRestart}
        title="Restart Neat?"
        description="The machine will briefly disconnect while it restarts."
      >
        <div className="button-row">
          <button
            className="secondary-button"
            onClick={() => setConfirmRestart(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="danger-button"
            disabled={restart.isPending}
            onClick={() => restart.mutate()}
            type="button"
          >
            Restart
          </button>
        </div>
      </Modal>
    </div>
  );
}
