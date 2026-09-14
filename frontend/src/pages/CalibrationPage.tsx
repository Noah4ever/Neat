import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeading } from "../components/SettingsPrimitives";
import { ProgressMeter } from "../components/ProgressMeter";
import { finishCalibration, getPumps, startCalibration } from "../services/api";
import { showApiError } from "../services/notifications";
import { useDrinkSession } from "../state/useDrinkSession";
export function CalibrationPage() {
  const [pump, setPump] = useState("");
  const [duration, setDuration] = useState(30);
  const [volume, setVolume] = useState("");
  const pumps = useQuery({ queryKey: ["pumps"], queryFn: getPumps });
  const { status, busy, stopping, stop } = useDrinkSession();
  const cache = useQueryClient();
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ["status"] });
    void cache.invalidateQueries({ queryKey: ["pumps"] });
  };
  const start = useMutation({
    mutationFn: () => startCalibration(Number(pump), duration * 1000),
    onSuccess: refresh,
    onError: showApiError,
  });
  const finish = useMutation({
    mutationFn: () => finishCalibration(Number(volume)),
    onSuccess: () => {
      refresh();
      setVolume("");
      toast.success("Calibration saved");
    },
    onError: showApiError,
  });
  const running = status?.kind === "calibration" && status.state === "running";
  const measured =
    status?.kind === "calibration" && status.state === "finished";
  return (
    <div className="settings-page">
      <PageHeading
        title="Calibration"
        subtitle="Measure once for accurate dispensing."
      />
      <section className="settings-card">
        <h2>{measured ? "Enter your measurement" : "Measure a pump"}</h2>
        <p>
          Place a measuring jug under the outlet. The pump runs for the selected
          duration, then stops.
        </p>
        {!measured && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              start.mutate();
            }}
          >
            <div className="form-fields">
              <label>
                Pump
                <select
                  required
                  disabled={busy}
                  value={pump}
                  onChange={(event) => setPump(event.target.value)}
                >
                  <option value="">Choose a pump</option>
                  {pumps.data?.map((item) => (
                    <option key={item.id} value={item.id}>
                      Pump {item.id}
                      {item.mlPerSec
                        ? ` · ${item.mlPerSec.toFixed(2)} ml/s`
                        : " · not calibrated"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Duration · seconds
                <input
                  type="number"
                  required
                  min={1}
                  max={120}
                  disabled={busy}
                  value={duration}
                  onChange={(event) => setDuration(Number(event.target.value))}
                />
              </label>
            </div>
            {running ? (
              <>
                <p>{status.label}</p>
                <ProgressMeter
                  value={status.progress}
                  label="Operation progress"
                />
                <button
                  type="button"
                  className="danger-button"
                  disabled={stopping}
                  onClick={() => void stop()}
                >
                  Stop calibration
                </button>
              </>
            ) : (
              <button
                className="primary-button"
                disabled={busy || start.isPending || !pump}
              >
                Start calibration
              </button>
            )}
          </form>
        )}
        {measured && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              finish.mutate();
            }}
          >
            <p>{status.label} · run complete</p>
            <label>
              Collected liquid · ml
              <input
                autoFocus
                type="number"
                min={0.1}
                max={10000}
                step="any"
                required
                value={volume}
                onChange={(event) => setVolume(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                disabled={stopping || finish.isPending}
                onClick={() => void stop()}
              >
                Discard
              </button>
              <button
                className="primary-button"
                disabled={finish.isPending || !(Number(volume) > 0)}
              >
                Save calibration
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
