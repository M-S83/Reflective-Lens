import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createEvent, myTeams, type TeamWithClub } from "../lib/db";
import { EVENT_TYPES, type EventType } from "../lib/types";
import { ErrorText, Spinner, TopBar } from "../components/ui";

export default function NewEvent() {
  const nav = useNavigate();
  const [teams, setTeams] = useState<TeamWithClub[]>([]);
  const [teamId, setTeamId] = useState("");
  const [type, setType] = useState<EventType>("training_session");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [opposition, setOpposition] = useState("");
  const [focus, setFocus] = useState("");
  const [purpose, setPurpose] = useState("");
  const [hopes, setHopes] = useState<string[]>([]);
  const [hopeDraft, setHopeDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    myTeams().then((t) => { setTeams(t); if (t[0]) setTeamId(t[0].id); })
      .catch((e) => setErr((e as Error).message));
  }, []);

  const addHope = () => {
    const v = hopeDraft.trim();
    if (v) { setHopes((h) => [...h, v]); setHopeDraft(""); }
  };

  const create = async () => {
    setErr(""); setBusy(true);
    try {
      const team = teams.find((t) => t.id === teamId);
      const ev = await createEvent({
        team_id: teamId, club_id: team?.club_id ?? "", event_type: type,
        title: title.trim() || defaultTitle(type, opposition), event_date: date,
        opposition, focus_area: focus, purpose, hoping_to_see: hopes,
      });
      nav(`/events/${ev.id}`);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const isMatch = type === "match" || type === "tournament";

  return (
    <div className="app">
      <TopBar title="New session" eyebrow="Set the intent"
        right={<button className="btn ghost sm" onClick={() => nav("/")}>Cancel</button>} />
      <div className="screen stack">
        {teams.length === 0 ? (
          <div className="card muted">First, add a team on the <a href="/teams">Teams</a> tab.</div>
        ) : (
          <>
            <div className="card stack">
              <div className="field"><label>Team</label>
                <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}, {t.club?.name}</option>)}
                </select></div>

              <div className="field"><label>Type</label>
                <div className="chipset">
                  {EVENT_TYPES.map((t) => (
                    <button key={t.value} className={`chip ${type === t.value ? "on" : ""}`}
                      onClick={() => setType(t.value)}>{t.label}</button>
                  ))}
                </div>
              </div>

              <div className="row" style={{ gap: 10 }}>
                <div className="field" style={{ flex: 1 }}><label>Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                {isMatch && (
                  <div className="field" style={{ flex: 1 }}><label>Opposition</label>
                    <input value={opposition} onChange={(e) => setOpposition(e.target.value)} placeholder="Opponent" /></div>
                )}
              </div>

              <div className="field"><label>Title <span className="muted small">(optional)</span></label>
                <input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder={defaultTitle(type, opposition)} /></div>
            </div>

            <div className="card stack">
              <h2 className="serif">What's the intent?</h2>
              <div className="field"><label>Focus area</label>
                <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. playing out from the back" /></div>
              <div className="field"><label>Purpose</label>
                <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="the aim of the session" /></div>
              <div className="field">
                <label>Hoping to see</label>
                <div className="row">
                  <input value={hopeDraft} onChange={(e) => setHopeDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addHope(); } }}
                    placeholder="an observable thing you hope to see" />
                  <button className="btn subtle sm" onClick={addHope}>Add</button>
                </div>
                {hopes.length > 0 && (
                  <div className="tags" style={{ marginTop: 8 }}>
                    {hopes.map((h, i) => (
                      <span key={i} className="tag" style={{ cursor: "pointer" }}
                        onClick={() => setHopes((x) => x.filter((_, j) => j !== i))} title="remove">
                        {h} ✕
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <ErrorText>{err}</ErrorText>
            <button className="btn block" onClick={create} disabled={busy || !teamId}>
              {busy ? <Spinner /> : "Start session"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function defaultTitle(type: EventType, opp: string): string {
  if (type === "match") return opp ? `Match vs ${opp}` : "Match";
  if (type === "tournament") return "Tournament";
  if (type === "training_session") return "Training session";
  return "Session";
}
