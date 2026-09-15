import { useQuery } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { getHealth } from "../services/api";

export function ConnectionBanner() {
  const health = useQuery({
    queryKey: ["health-heartbeat"],
    queryFn: getHealth,
    retry: false,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  if (!health.isError) return null;
  return (
    <div className="connection-banner" role="status">
      <WifiOff size={19} />
      <span>
        <strong>Neat is offline</strong>
        <small>Reconnecting automatically…</small>
      </span>
    </div>
  );
}
