import { Check, Clock3, Search, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { addQueue, addRequest, getEvent, getMine, removeQueue, removeRequest } from "../api";
import { RecipeCard } from "../components/RecipeCard";
import type { EventData, HostData, QueueEntry, Recipe } from "../types";

const nameKey = (slug: string) => `neat.guestName.${slug}`;
type Mine = { requests: HostData["requests"]; queue: QueueEntry[] };

export function EventPage() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<EventData | null>(null);
  const [mine, setMine] = useState<Mine>({ requests: [], queue: [] });
  const [name, setName] = useState(() => localStorage.getItem(nameKey(slug)) ?? "");
  const [query, setQuery] = useState("");
  const [pendingRecipe, setPendingRecipe] = useState<Recipe | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<{ label: string; cancel: () => void } | null>(null);
  const removalTimer = useRef<number | null>(null);

  const refreshMine = async () => setMine(await getMine(slug));
  useEffect(() => {
    Promise.all([getEvent(slug), getMine(slug)])
      .then(([event, own]) => { setData(event); setMine(own); })
      .catch((reason: Error) => setError(reason.message));
    return () => { if (removalTimer.current) window.clearTimeout(removalTimer.current); };
  }, [slug]);

  const recipes = useMemo(() => data?.recipes.filter((recipe) =>
    `${recipe.name} ${recipe.subtitle}`.toLowerCase().includes(query.toLowerCase())) ?? [], [data, query]);
  const selectedIds = useMemo(() => new Set([
    ...mine.requests.map((item) => item.recipeId),
    ...mine.queue.map((item) => item.recipeId),
  ].filter(Boolean)), [mine]);
  const live = data?.event.mode === "live";

  async function add(recipe: Recipe, guestName = name) {
    if (!guestName.trim()) { setPendingRecipe(recipe); setNameOpen(true); return; }
    setSaving(true); setError("");
    try {
      if (live) await addQueue(slug, { guestName, recipeId: recipe.id, sizeMl: 400, strength: "standard" });
      else await addRequest(slug, { guestName, recipeId: recipe.id, recipeName: recipe.name });
      await refreshMine();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not add this drink"); }
    finally { setSaving(false); }
  }

  function remove(kind: "request" | "queue", item: HostData["requests"][number] | QueueEntry) {
    if (removalTimer.current) window.clearTimeout(removalTimer.current);
    const previous = structuredClone(mine);
    setMine((current) => ({
      requests: kind === "request" ? current.requests.filter((value) => value.id !== item.id) : current.requests,
      queue: kind === "queue" ? current.queue.filter((value) => value.id !== item.id) : current.queue,
    }));
    let cancelled = false;
    removalTimer.current = window.setTimeout(async () => {
      if (cancelled) return;
      try {
        if (kind === "request") await removeRequest(slug, item.id);
        else await removeQueue(slug, item.id);
      } catch (reason) {
        setMine(previous);
        setError(reason instanceof Error ? reason.message : "Could not remove this drink");
      } finally { setUndo(null); removalTimer.current = null; }
    }, 5000);
    setUndo({ label: `${item.recipeName} removed`, cancel: () => {
      cancelled = true;
      if (removalTimer.current) window.clearTimeout(removalTimer.current);
      removalTimer.current = null; setMine(previous); setUndo(null);
    }});
  }

  function toggleRecipe(recipe: Recipe) {
    const queued = mine.queue.find((item) => item.recipeId === recipe.id);
    const requested = mine.requests.find((item) => item.recipeId === recipe.id);
    if (queued) remove("queue", queued);
    else if (requested) remove("request", requested);
    else void add(recipe);
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("guestName") ?? "").trim();
    if (!value) return;
    setName(value); localStorage.setItem(nameKey(slug), value); setNameOpen(false);
    if (pendingRecipe) void add(pendingRecipe, value);
    setPendingRecipe(null);
  }

  async function submitCustom(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setNameOpen(true); return; }
    setSaving(true);
    try {
      await addRequest(slug, { guestName: name, recipeId: null, recipeName: customName.trim() });
      setCustomName(""); setCustomOpen(false); await refreshMine();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not add this choice"); }
    finally { setSaving(false); }
  }

  if (error && !data) return <main className="state-page"><h1>This link is unavailable.</h1><p>{error}</p></main>;
  if (!data) return <main className="state-page"><div className="loader" /><p>Opening…</p></main>;

  return <main className="event-page">
    <section className="event-head">
      <div className={`mode-pill ${live ? "live" : ""}`}>{live ? (data.event.machineOnline ? "Machine ready" : "Machine offline") : "Planning"}</div>
      <h1>{data.event.title}</h1>
      <p>{live ? "Tap every drink you want. Your choices appear on Neat immediately." : `${data.event.hostName} is planning the drinks. Tap all cocktails you would enjoy.`}</p>
      {name && <button className="guest-name-button" onClick={() => setNameOpen(true)} type="button"><UserRound size={17} /> {name}</button>}
    </section>

    {(mine.requests.length > 0 || mine.queue.length > 0) && <section className="my-choices">
      <div><h2>{live ? "Your queue" : "Your choices"}</h2><p>Tap a selected cocktail or the bin to remove it.</p></div>
      <div className="choice-list">
        {mine.queue.map((item) => <article key={item.id}><span><Clock3 /><span><strong>{item.recipeName}</strong><small>Waiting for {item.guestName}</small></span></span><button aria-label={`Remove ${item.recipeName}`} onClick={() => remove("queue", item)} type="button"><Trash2 /></button></article>)}
        {mine.requests.map((item) => <article key={item.id}><span><Check /><span><strong>{item.recipeName}</strong><small>Selected by {item.guestName}</small></span></span><button aria-label={`Remove ${item.recipeName}`} onClick={() => remove("request", item)} type="button"><Trash2 /></button></article>)}
      </div>
    </section>}

    <section className="catalog-head"><div><h2>{live ? "Available now" : "What would you drink?"}</h2><p>Choose as many as you like. Every tap is saved.</p></div><label className="search"><Search /><input onChange={(event) => setQuery(event.target.value)} placeholder="Search drinks" value={query} />{query && <button aria-label="Clear search" onClick={() => setQuery("")} type="button"><X /></button>}</label></section>
    <div className="recipe-grid">{recipes.map((recipe) => <RecipeCard key={recipe.id} onClick={() => toggleRecipe(recipe)} recipe={recipe} selected={selectedIds.has(recipe.id)} />)}</div>
    {!live && <button className="custom-choice" onClick={() => setCustomOpen(true)} type="button"><span><strong>Your own mix</strong><small>Cola Bacardi or something completely different.</small></span><span>Add it</span></button>}
    {error && <p className="form-error event-error">{error}</p>}

    {nameOpen && <div className="sheet-backdrop" onClick={() => { setNameOpen(false); setPendingRecipe(null); }}><form className="name-sheet" onClick={(event) => event.stopPropagation()} onSubmit={saveName}>
      <button aria-label="Close" className="sheet-close" onClick={() => { setNameOpen(false); setPendingRecipe(null); }} type="button"><X /></button>
      <h2>What should Neat call you?</h2><p>Your name helps you find your drinks at the machine.</p>
      <input autoFocus defaultValue={name} maxLength={60} name="guestName" placeholder="Your name" required />
      <button className="primary wide" type="submit">Continue</button>
    </form></div>}

    {customOpen && <div className="sheet-backdrop" onClick={() => setCustomOpen(false)}><form className="name-sheet" onClick={(event) => event.stopPropagation()} onSubmit={submitCustom}>
      <button aria-label="Close" className="sheet-close" onClick={() => setCustomOpen(false)} type="button"><X /></button>
      <h2>Your own mix</h2><input autoFocus onChange={(event) => setCustomName(event.target.value)} placeholder="e.g. Bacardi Cola" required value={customName} />
      <button className="primary wide" disabled={saving} type="submit">Add choice</button>
    </form></div>}

    {undo && <div className="undo-bar"><span>{undo.label}</span><button onClick={undo.cancel} type="button">Undo</button></div>}
    {saving && <span className="sync-status">Saving…</span>}
  </main>;
}
