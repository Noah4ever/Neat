import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createEvent, saveHostToken } from "../api";

export function CreateEventPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState(""); const [hostName, setHostName] = useState(""); const [date, setDate] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await createEvent({ title, hostName, date: date || null });
      saveHostToken(result.event.slug, result.hostToken);
      navigate(`/e/${result.event.slug}/host`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create event"); setBusy(false); }
  }
  return <main className="narrow-page"><div className="page-intro"><p className="eyebrow">A few seconds to start</p><h1>Plan drinks together.</h1><p>This can be a party, a wedding, a work event or dinner with friends. You can connect a Neat machine later.</p></div>
    <form className="event-form" onSubmit={submit}>
      <label><span>Event name</span><input autoFocus maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Friday at the studio" required value={title} /></label>
      <label><span>Your name</span><input maxLength={60} onChange={(e) => setHostName(e.target.value)} placeholder="Noah" required value={hostName} /></label>
      <label><span>Date <small>Optional</small></span><input onChange={(e) => setDate(e.target.value)} type="date" value={date} /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary wide" disabled={busy} type="submit">{busy ? "Creating…" : "Create event"} <ArrowRight /></button>
      <p className="privacy-note">No account needed. A private host key stays on this device.</p>
    </form>
  </main>;
}
