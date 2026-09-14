import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeading } from "../components/SettingsPrimitives";
import { ProgressMeter } from "../components/ProgressMeter";
import { getPumps, startCleaning } from "../services/api";
import { showApiError } from "../services/notifications";
import { useDrinkSession } from "../state/useDrinkSession";
export function CleaningSettingsPage() {
  const [pump, setPump] = useState("all");
  const pumps = useQuery({ queryKey: ["pumps"], queryFn: getPumps });
  const { status, busy, stopping, stop } = useDrinkSession();
  const cache = useQueryClient();
  const start = useMutation({
    mutationFn: () => startCleaning(pump === "all" ? undefined : Number(pump)),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["status"] }),
    onError: showApiError,
  });
  const running = status?.kind === "cleaning" && status.state === "running";
  return (
    <div className="settings-page">
      <PageHeading
        title="Cleaning"
        subtitle="Keep your machine ready for the next round."
      />
      <section className="settings-card">
        <h2>Rinse pumps</h2>
        <p>
          Place the inlet tubes in clean water and a large empty container under
          the outlet.
        </p>
        <label>
          Pumps to rinse
          <select
            value={pump}
            disabled={busy}
            onChange={(event) => setPump(event.target.value)}
          >
            <option value="all">All pumps</option>
            {pumps.data?.map((item) => (
              <option key={item.id} value={item.id}>
                Pump {item.id}
              </option>
            ))}
          </select>
        </label>
        {running ? (
          <>
            <p>{status.label}</p>
            <ProgressMeter value={status.progress} label="Operation progress" />
            <button
              className="danger-button"
              disabled={stopping}
              onClick={() => void stop()}
            >
              Stop rinsing
            </button>
          </>
        ) : (
          <button
            className="primary-button"
            disabled={busy || start.isPending || !pumps.data?.length}
            onClick={() => start.mutate()}
          >
            {start.isPending ? "Starting…" : "Start rinsing"}
          </button>
        )}
        {status?.kind === "cleaning" && status.state === "finished" && (
          <p className="success-text">Rinse finished.</p>
        )}
        {busy && !running && (
          <p className="muted">Another operation is in progress.</p>
        )}
      </section>
    </div>
  );
}
