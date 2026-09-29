import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode, RefreshCw, Upload, UsersRound, WifiOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageInfoButton } from "../components/PageInfoButton";
import { tr } from "../services/language";
import { createCloudWebSocket, getCloudConfig, getCloudQueue, importOfflineEventPack } from "../services/cloud";
import { getDevice } from "../services/api";

export function QueuePage() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const config = getCloudConfig();
  const device = useQuery({ queryKey: ["device"], queryFn: getDevice });
  const machineId = device.data?.id ?? config.machineId;
  const queueUrl = `${config.publicSiteUrl}/m/${encodeURIComponent(machineId)}`;
  const queue = useQuery({ queryKey: ["cloud-queue", machineId], queryFn: () => getCloudQueue(machineId), enabled: !!machineId, refetchInterval: 4_000 });
  useEffect(() => createCloudWebSocket(machineId, (event) => {
    if (event.type.startsWith("queue.")) void cache.invalidateQueries({ queryKey: ["cloud-queue"] });
  }), [cache, machineId]);

  return <main className="queue-page">
    <div className="queue-heading"><div><span>{tr("Requested from phones", "Vom Handy gewählt")}</span><div className="page-title-with-info"><h1>{tr("Find your name", "Finde deinen Namen")}</h1><PageInfoButton /></div><p>{tr("Tap your request, choose the size, and start your drink.", "Tippe auf deinen Wunsch, wähle die Größe und starte den Cocktail.")}</p></div><button aria-label="Refresh queue" className="icon-button queue-refresh" disabled={queue.isFetching} onClick={() => void queue.refetch()} type="button"><RefreshCw size={21} /></button></div>
    <section className="queue-share-card"><div className="queue-qr"><QRCodeSVG bgColor="#ffffff" fgColor="#111113" level="M" marginSize={2} size={132} value={queueUrl} /></div><div><QrCode size={22} /><h2>{tr("Add a drink from your phone", "Cocktail vom Handy hinzufügen")}</h2><p>{tr("Scan this code. No event or account is required.", "Code scannen. Kein Event und kein Konto nötig.")}</p><small>{queueUrl}</small></div></section>
    {queue.error ? <section className="queue-state"><WifiOff /><h2>Online queue unavailable</h2><p>Local cocktails still work. Check the internet connection in Settings or import an offline pack.</p><OfflinePackInput onImported={() => void queue.refetch()} /></section>
    : !queue.data?.length ? <QueueState />
    : <section className="queue-list">{queue.data.map((entry, index) => <button key={entry.id} onClick={() => {
      if (entry.machineRecipeId === null) { toast.error("This recipe is not installed yet"); return; }
      navigate(`/prepare/${entry.machineRecipeId}?queueEntry=${encodeURIComponent(entry.id)}`);
    }} type="button"><span className="queue-position">{index + 1}</span><span className="queue-person"><strong>{entry.guestName}</strong><small>{entry.recipeName}</small></span><span aria-hidden="true">›</span></button>)}</section>}
    <div className="offline-queue-section"><OfflinePackInput onImported={() => void queue.refetch()} /></div>
  </main>;
}
function OfflinePackInput({ onImported }: { onImported: () => void }) {
  return <label className="secondary-button offline-pack-import"><Upload size={18} /> Import offline pack<input accept=".json,.neatpack" onChange={(event) => {
    const file = event.target.files?.[0]; if (!file) return;
    void importOfflineEventPack(file).then((entries) => { onImported(); toast.success(`${entries.length} requests imported`); }).catch((reason: unknown) => toast.error(reason instanceof Error ? reason.message : "Could not import pack"));
    event.target.value = "";
  }} type="file" /></label>;
}
function QueueState() {
  return <section className="queue-state"><UsersRound /><h2>{tr("No one is waiting", "Niemand wartet")}</h2><p>{tr("Phone requests appear here automatically.", "Handy-Wünsche erscheinen hier automatisch.")}</p></section>;
}
