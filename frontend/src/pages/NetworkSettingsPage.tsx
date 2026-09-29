import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LockKeyhole, Radio, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../components/Modal";
import {
  PageHeading,
  SettingsGroup,
  SettingsRow,
} from "../components/SettingsPrimitives";
import { QueryMessage } from "../components/QueryMessage";
import {
  connectNetwork,
  disconnectNetwork,
  forgetNetwork,
  getNetwork,
  reconnectNetwork,
  scanNetworks,
  testInternetConnection,
} from "../services/api";
import { showApiError } from "../services/notifications";
export function NetworkSettingsPage() {
  const query = useQuery({
    queryKey: ["network"],
    queryFn: getNetwork,
    refetchInterval: 5000,
  });
  const cache = useQueryClient();
  const [selected, setSelected] = useState<{
    ssid: string;
    secured: boolean;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmForget, setConfirmForget] = useState(false);
  const scan = useMutation({
    mutationFn: scanNetworks,
    onSuccess: () => cache.invalidateQueries({ queryKey: ["network"] }),
    onError: showApiError,
  });
  const connect = useMutation({
    mutationFn: () => connectNetwork(selected!.ssid, password),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["network"] });
      setSelected(null);
      setPassword("");
      toast.success("Connection requested");
    },
    onError: showApiError,
  });
  const forget = useMutation({
    mutationFn: forgetNetwork,
    onSuccess: () => {
      setConfirmForget(false);
      void cache.invalidateQueries({ queryKey: ["network"] });
      toast.success("Wi-Fi network forgotten");
    },
    onError: showApiError,
  });
  const disconnect = useMutation({
    mutationFn: disconnectNetwork,
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["network"] });
      toast.success("Wi-Fi disconnected");
    },
    onError: showApiError,
  });
  const reconnect = useMutation({
    mutationFn: reconnectNetwork,
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["network"] });
      toast.success("Reconnecting to saved Wi-Fi");
    },
    onError: showApiError,
  });
  const internet = useMutation({
    mutationFn: testInternetConnection,
    onError: showApiError,
  });
  const [internetStage, setInternetStage] = useState(0);
  useEffect(() => {
    if (!internet.isPending) return;
    const startedAt = window.setTimeout(() => setInternetStage(1), 350);
    const securedAt = window.setTimeout(() => setInternetStage(2), 950);
    return () => {
      window.clearTimeout(startedAt);
      window.clearTimeout(securedAt);
    };
  }, [internet.isPending]);
  return (
    <div className="settings-page">
      <PageHeading title="Network" subtitle="Connect Neat to your Wi-Fi." />
      {!query.data ? (
        <QueryMessage query={query} />
      ) : (
        <>
          <h2 className="settings-section-label">Wi-Fi</h2>
          <SettingsGroup>
            <div className="settings-row">
              <Wifi className="settings-row__icon" size={20} />
              <span className="settings-row__copy">
                <strong>{query.data.ssid || "Not connected"}</strong>
                <small>
                  {query.data.connected
                    ? `Connected · ${query.data.address}`
                    : query.data.ssid
                      ? "Saved · Not connected"
                      : "Choose a network below."}
                </small>
              </span>
              {query.data.ssid && (
                <div className="network-actions">
                  <button
                    className="compact-action"
                    disabled={disconnect.isPending || reconnect.isPending}
                    onClick={() =>
                      query.data.connected
                        ? disconnect.mutate()
                        : reconnect.mutate()
                    }
                    type="button"
                  >
                    {query.data.connected ? "Disconnect" : "Reconnect"}
                  </button>
                  <button
                    className="compact-action danger-text"
                    onClick={() => setConfirmForget(true)}
                    type="button"
                  >
                    Forget
                  </button>
                </div>
              )}
            </div>
            <SettingsRow
              title="Neat access point"
              description="Connect directly to Neat if no other Wi-Fi is available."
              value={query.data.accessPoint || "Off"}
            />
            <SettingsRow
              title="Access point password"
              value={query.data.accessPointPassword || "—"}
            />
          </SettingsGroup>
          <h2 className="settings-section-label">Internet</h2>
          <SettingsGroup>
            <button
              className="settings-row internet-test-row"
              disabled={internet.isPending}
              onClick={() => {
                setInternetStage(0);
                internet.mutate();
              }}
              type="button"
            >
              <Radio className={internet.isPending ? "internet-testing" : "settings-row__icon"} size={20} />
              <span className="settings-row__copy">
                <strong>Test internet connection</strong>
                <small>{internet.isPending
                  ? ["Checking Wi-Fi and DNS…", "Opening a secure connection…", "Waiting for the Neat Cloud…"][internetStage]
                  : internet.data?.reachable
                    ? `Neat Cloud reached in ${internet.data.latencyMs} ms.`
                    : internet.data?.dnsResolved
                      ? "DNS works, but the Neat Cloud did not answer."
                      : internet.data?.connected
                        ? "Wi-Fi is connected, but DNS is unavailable."
                        : internet.data
                          ? "Connect Neat to Wi-Fi first."
                          : "Check Wi-Fi, DNS and the Neat Cloud."}</small>
                {internet.isPending && <span className="internet-test-progress" aria-hidden="true"><i /></span>}
              </span>
              {internet.data?.reachable && <CheckCircle2 className="success-text" />}
            </button>
          </SettingsGroup>
          <div className="section-heading">
            <div>
              <h2>Available networks</h2>
              <p className="muted">Choose a network for Neat.</p>
            </div>
            <button
              className="secondary-button"
              disabled={scan.isPending}
              onClick={() => scan.mutate()}
            >
              {scan.isPending ? "Scanning…" : "Scan networks"}
            </button>
          </div>
          <div className="management-list network-list">
            {query.data.networks.map((item) => (
              <button
                key={item.ssid}
                className="management-row"
                onClick={() => {
                  setSelected(item);
                  setPassword("");
                }}
              >
                <Wifi size={22} />
                <strong>{item.ssid}</strong>
                {item.secured && <LockKeyhole size={18} />}
              </button>
            ))}
          </div>
          {!query.data.networks.length && (
            <p className="muted">Scan to find nearby networks.</p>
          )}
        </>
      )}
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !connect.isPending) setSelected(null);
        }}
        title={selected?.ssid ?? "Connect"}
        description="Changing networks may disconnect this screen from Neat."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            connect.mutate();
          }}
        >
          {selected?.secured && (
            <label>
              Password
              <input
                type="password"
                autoComplete="new-password"
                required
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )}
          <button className="primary-button" disabled={connect.isPending}>
            {connect.isPending ? "Connecting…" : "Connect"}
          </button>
        </form>
      </Modal>
      <Modal
        open={confirmForget}
        onOpenChange={setConfirmForget}
        title="Forget this network?"
        description={`Neat will remove the saved password for ${query.data?.ssid ?? "this Wi-Fi"}. Its own access point stays available.`}
      >
        <div className="button-row">
          <button
            className="secondary-button"
            onClick={() => setConfirmForget(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="danger-button"
            disabled={forget.isPending}
            onClick={() => forget.mutate()}
            type="button"
          >
            Forget network
          </button>
        </div>
      </Modal>
    </div>
  );
}
