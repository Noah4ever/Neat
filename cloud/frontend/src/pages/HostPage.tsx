import { Check, Clipboard, Download, Expand, Link2, MonitorSmartphone, RefreshCw, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createPairing, downloadPack, getHost, getHostToken, hostRemoveRequest, setMode, updateShopping } from "../api";
import type { HostData } from "../types";

export function HostPage() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<HostData | null>(null);
  const [error, setError] = useState("");
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [shoppingSort, setShoppingSort] = useState<"alcohol" | "name" | "quantity">("alcohol");
  const load = useCallback(() => getHost(slug).then(setData).catch((reason: Error) => setError(reason.message)), [slug]);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 10_000); return () => window.clearInterval(timer); }, [load]);
  const totals = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of data?.requests ?? []) counts.set(item.recipeName, (counts.get(item.recipeName) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [data]);
  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/e/${slug}`);
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  }
  async function pair() {
    setBusy(true); setError("");
    try { setPairing(await createPairing(slug)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create code"); }
    finally { setBusy(false); }
  }
  async function toggleMode() {
    if (!data) return;
    setBusy(true);
    try { await setMode(slug, data.event.mode === "planning" ? "live" : "planning"); await load(); }
    finally { setBusy(false); }
  }
  async function toggleShopping(key: string) {
    if (!data) return;
    const checked = new Set(data.checkedShoppingKeys);
    if (checked.has(key)) checked.delete(key); else checked.add(key);
    const checkedShoppingKeys = [...checked];
    setData({ ...data, checkedShoppingKeys });
    try { await updateShopping(slug, checkedShoppingKeys); }
    catch { setData(data); setError("Could not update the shopping list"); }
  }
  async function removeChoice(id: string) {
    const previous = data;
    if (!previous) return;
    setData({ ...previous, requests: previous.requests.filter((item) => item.id !== id) });
    try { await hostRemoveRequest(slug, id); await load(); }
    catch { setData(previous); setError("Could not remove the choice"); }
  }
  if (!getHostToken(slug)) return <main className="state-page"><h1>This is the private host view.</h1><p>Open it on the device where you created the event.</p><Link to={`/e/${slug}`}>Open guest page</Link></main>;
  if (!data && error) return <main className="state-page"><h1>Host access failed.</h1><p>{error}</p></main>;
  if (!data) return <main className="state-page"><div className="loader" /></main>;

  return <main className="host-page">
    <header className="host-head"><div><h1>{data.event.title}</h1><p>{data.requests.length} choices · {data.queue.length} waiting now</p></div><button aria-label="Refresh" className="icon-control" onClick={() => void load()} type="button"><RefreshCw /></button></header>
    {error && <p className="form-error">{error}</p>}
    <section className="share-panel"><div><span className="round-icon"><Link2 /></span><div><h2>Invite people</h2><p>Anyone with the link can add and remove their own choices.</p></div></div><button className="primary" onClick={() => void copyLink()} type="button">{copied ? <Check /> : <Clipboard />}{copied ? "Copied" : "Copy guest link"}</button></section>
    <div className="host-grid">
      <section className="host-section"><div className="section-title"><h2>Most wanted</h2><span>{data.requests.length}</span></div>{totals.length ? <div className="results-list">{totals.map(([name, count], index) => <article key={name}><b>{index + 1}</b><span>{name}</span><strong>{count}</strong></article>)}</div> : <div className="empty"><p>Share the guest link to collect the first choices.</p></div>}</section>
      <section className="host-section"><div className="section-title"><h2>{data.machine ? data.machine.name : "Connect Neat"}</h2>{data.machine?.online ? <Wifi className="green" /> : <WifiOff />}</div>{data.machine ? <div className="machine-status"><strong>{data.machine.online ? "Online and ready" : "Paired, currently offline"}</strong><p>{data.machine.online ? "New requests appear on Neat automatically." : "Planning continues while Neat is offline."}</p><button className="secondary" disabled={busy || !data.machine.online} onClick={() => void toggleMode()} type="button">{data.event.mode === "live" ? "Return to planning" : "Open live queue"}</button></div> : <div className="connect-flow"><p>On Neat, open <strong>Settings → General → Connect to a Neat event</strong> and enter this code.</p>{pairing ? <div className="pair-code">{pairing.code.match(/.{1,3}/g)?.join(" ")}</div> : <button className="secondary" disabled={busy} onClick={() => void pair()} type="button"><MonitorSmartphone /> Create pairing code</button>}{pairing && <small>Valid until {new Date(pairing.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</small>}</div>}</section>
    </div>
    <section className="host-section pump-plan"><div className="section-title"><h2>Machine setup</h2><span>{data.pumpPlan.requiredPumps} pumps</span></div><p><strong>{data.pumpPlan.requiredPumps} different ingredients</strong> need a pump for all requested cocktails.</p><div className="ingredient-plan"><span><b>In Neat</b>{data.pumpPlan.automaticIngredients.join(", ") || "None yet"}</span><span><b>Next to Neat</b>{data.pumpPlan.manualIngredients.join(", ") || "Nothing"}</span></div></section>
    <section className="host-section"><div className="section-title"><h2>Guest choices</h2><span>{data.requests.length}</span></div><div className="host-request-list">{data.requests.map((item) => <article key={item.id}><span><strong>{item.recipeName}</strong><small>{item.guestName}</small></span><button aria-label={`Remove ${item.recipeName}`} onClick={() => void removeChoice(item.id)} type="button"><Trash2 /></button></article>)}</div></section>
    <section className="shopping-receipt">
      <ShoppingHeader sort={shoppingSort} setSort={setShoppingSort} onExpand={() => setShoppingOpen(true)} />
      <ShoppingRows data={data} onToggle={toggleShopping} sort={shoppingSort} />
    </section>
    <section className="offline-panel"><div><span className="round-icon"><Download /></span><div><h2>No internet at the venue?</h2><p>The offline pack includes the selected recipes and their images as local data.</p></div></div><button className="secondary" onClick={() => void downloadPack(slug)} type="button"><Download /> Download offline pack</button></section>
    {shoppingOpen && <div className="receipt-overlay"><section className="shopping-receipt shopping-receipt--large"><button aria-label="Close" className="sheet-close" onClick={() => setShoppingOpen(false)} type="button"><X /></button><ShoppingHeader sort={shoppingSort} setSort={setShoppingSort} /><ShoppingRows data={data} onToggle={toggleShopping} sort={shoppingSort} /></section></div>}
  </main>;
}

function ShoppingHeader({ sort, setSort, onExpand }: { sort: "alcohol" | "name" | "quantity"; setSort: (value: "alcohol" | "name" | "quantity") => void; onExpand?: () => void }) {
  return <div className="shopping-head"><div><h2>Shopping list</h2><p>Recipe amounts plus 15% reserve.</p></div><div className="shopping-tools"><select aria-label="Sort shopping list" onChange={(event) => setSort(event.target.value as typeof sort)} value={sort}><option value="alcohol">Alcohol first</option><option value="name">Name</option><option value="quantity">Most needed</option></select>{onExpand && <button aria-label="Open full screen shopping list" className="icon-control" onClick={onExpand} type="button"><Expand /></button>}</div></div>;
}
function ShoppingRows({ data, onToggle, sort }: { data: HostData; onToggle: (key: string) => void; sort: "alcohol" | "name" | "quantity" }) {
  if (!data.shoppingList.length) return <p className="empty">Guest choices will become a shopping list here.</p>;
  const rows = [...data.shoppingList].sort((a, b) => sort === "quantity" ? b.amountMl - a.amountMl : sort === "name" ? a.name.localeCompare(b.name) : Number(b.category === "alcohol") - Number(a.category === "alcohol") || a.name.localeCompare(b.name));
  return <div className="shopping-list">{rows.map((item) => {
    const checked = data.checkedShoppingKeys.includes(item.key);
    return <label className={checked ? "checked" : ""} key={item.key}><input checked={checked} onChange={() => onToggle(item.key)} type="checkbox" /><span><strong>{item.name}</strong><small>{item.amountMl} ml for {item.drinks} drinks</small></span><b>{item.packages} × {item.packageMl} ml</b></label>;
  })}</div>;
}
