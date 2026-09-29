import { Check, Search, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { addMachineQueue, getMachineMine, getMachinePublic, removeMachineQueue } from "../api";
import { RecipeCard } from "../components/RecipeCard";
import type { QueueEntry, Recipe } from "../types";

const key = (id: string) => `neat.machineGuestName.${id}`;

export function MachineQueuePage() {
  const { machineId = "" } = useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getMachinePublic>> | null>(null);
  const [mine, setMine] = useState<QueueEntry[]>([]);
  const [name, setName] = useState(() => localStorage.getItem(key(machineId)) ?? "");
  const [pending, setPending] = useState<Recipe | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const [nextData, nextMine] = await Promise.all([getMachinePublic(machineId), getMachineMine(machineId)]);
    setData(nextData); setMine(nextMine.queue);
  };
  useEffect(() => { void refresh().catch((reason: Error) => setError(reason.message)); }, [machineId]);
  const recipes = useMemo(() => data?.recipes.filter((recipe) =>
    `${recipe.name} ${recipe.subtitle}`.toLowerCase().includes(query.toLowerCase())) ?? [], [data, query]);

  async function add(recipe: Recipe, guestName = name) {
    if (!guestName) { setPending(recipe); setNameOpen(true); return; }
    setBusy(true); setError("");
    try { await addMachineQueue(machineId, { guestName, recipeId: recipe.id }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not join the queue"); }
    finally { setBusy(false); }
  }
  async function toggle(recipe: Recipe) {
    const existing = mine.find((entry) => entry.recipeId === recipe.id);
    if (!existing) return add(recipe);
    setBusy(true);
    try { await removeMachineQueue(machineId, existing.id); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the queue"); }
    finally { setBusy(false); }
  }
  function submitName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("guestName") ?? "").trim();
    if (!value) return;
    localStorage.setItem(key(machineId), value); setName(value);
    const recipe = pending; setPending(null); setNameOpen(false);
    if (recipe) void add(recipe, value);
  }
  if (!data && !error) return <main className="state-page"><div className="loader" /><p>Finding Neat…</p></main>;
  if (!data) return <main className="state-page"><h1>Neat is unavailable.</h1><p>{error}</p></main>;
  return <main className="event-page">
    <section className="event-head"><div className={`mode-pill ${data.machine.online ? "live" : ""}`}>{data.machine.online ? "Machine ready" : "Machine offline"}</div><h1>{data.machine.name}</h1><p>Choose every drink you want. They will wait under your name on the machine.</p>{name && <button className="guest-name-button" onClick={() => setNameOpen(true)} type="button"><UserRound size={17} /> {name}</button>}</section>
    {!!mine.length && <section className="my-choices"><div><h2>Your queue</h2><p>Tap a selected drink to remove it.</p></div><div className="choice-list">{mine.map((item) => <article key={item.id}><span><Check /><span><strong>{item.recipeName}</strong><small>Waiting for {item.guestName}</small></span></span><button aria-label={`Remove ${item.recipeName}`} onClick={() => void removeMachineQueue(machineId, item.id).then(refresh)} type="button"><Trash2 /></button></article>)}</div></section>}
    <section className="catalog-head"><div><h2>What would you like?</h2><p>Tap once to add. Tap again to remove.</p></div><label className="search"><Search /><input onChange={(event) => setQuery(event.target.value)} placeholder="Search drinks" value={query} />{query && <button aria-label="Clear" onClick={() => setQuery("")} type="button"><X /></button>}</label></section>
    <div className="recipe-grid">{recipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} selected={mine.some((item) => item.recipeId === recipe.id)} onClick={() => void toggle(recipe)} />)}</div>
    {error && <p className="form-error event-error">{error}</p>}{busy && <span className="sync-status">Saving…</span>}
    {nameOpen && <div className="sheet-backdrop" onClick={() => { setNameOpen(false); setPending(null); }}><form className="name-sheet" onClick={(event) => event.stopPropagation()} onSubmit={submitName}><button aria-label="Close" className="sheet-close" onClick={() => { setNameOpen(false); setPending(null); }} type="button"><X /></button><h2>What should Neat call you?</h2><p>You only enter this once on this phone.</p><input autoFocus defaultValue={name} name="guestName" placeholder="Your name" required /><button className="primary wide">Continue</button></form></div>}
  </main>;
}
