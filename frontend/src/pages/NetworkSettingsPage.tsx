import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../components/Modal";
import {
  PageHeading,
  SettingsGroup,
  SettingsRow,
} from "../components/SettingsPrimitives";
import { QueryMessage } from "../components/QueryMessage";
import { connectNetwork, getNetwork, scanNetworks } from "../services/api";
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
  return (
    <div className="settings-page">
      <PageHeading title="Network" subtitle="Connect Neat to your Wi-Fi." />
      {!query.data ? (
        <QueryMessage query={query} />
      ) : (
        <>
          <h2 className="settings-section-label">Wi-Fi</h2>
          <SettingsGroup>
            <SettingsRow
              icon={Wifi}
              title={query.data.ssid || "Not connected"}
              description={
                query.data.connected
                  ? `Connected · ${query.data.address}`
                  : "Choose a network below."
              }
            />
            <SettingsRow
              title="Access point"
              value={query.data.accessPoint || "Off"}
            />
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
    </div>
  );
}
