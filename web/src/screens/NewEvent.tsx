import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createEvent, myTeams, type TeamWithClub } from "../lib/db";
import { EVENT_TYPES, CUSTOM_TYPE_MAX, type EventType } from "../lib/types";
import { ErrorText, Spinner, TopBar } from "../components/ui";

export default function NewEvent() {
  const nav = useNavigate();
  const [teams, setTeams] = useState<TeamWithClub[]>([]);
  const [teamId, setTeamId] = useState("");
  const [customType, setCustomType] = useState("");
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
    // Deliberately no preselection. Team is optional now, so defaulting to
    // the first one would quietly attach a one-to-one to a squad.
    myTeams().then(setTeams).catch((e) => setErr((e as Error).message));
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
        team_id: teamId || null, club_id: team?.club_id ?? null,
        event_type: type, custom_type: customType,
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
        <>
            <div className="card stack">
              {/* Session type comes FIRST. It is the question that decides
                  whether the rest of the form is even relevant: a one-to-one has
                  no squad and no opposition, so asking "which team" before
                  "what kind of session" is the wrong way round. */}
              <div className="field"><label>What kind of session?</label>
                <div className="chipset">
                  {EVENT_TYPES.map((t) => (
                    <button key={t.value} className={`chip ${type === t.value ? "on" : ""}`}
                      onClick={() => setType(t.value)}>{t.label}</button>
                  ))}
                </div>
              </div>

              {type === "other" && (
                <div className="field">
                  <label htmlFor="custom-type">Name it</label>
                  <input
                    id="custom-type"
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                    placeholder="Goalkeeping session"
                    maxLength={CUSTOM_TYPE_MAX}
                  />
                  <div className="muted small">
                    Your name for it. Reports keep this kind of session separate
                    from your training and matches, so its focus stays its own.
                  </div>
                </div>
              )}

              {/* Team is OPTIONAL. Plenty of coaching is not a squad: a
                  goalkeeping coach, a one-to-one, a session for a player who is
                  not on any of your teams. Requiring a team turned those away at
                  the door. */}
              <div className="field">
                <label htmlFor="team">
                  Team <span className="muted small">(only if this is with one of your teams)</span>
                </label>
                <select id="team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  <option value="">No team, just me and the session</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}, {t.club?.name}</option>
                  ))}
                </select>
                {teams.length === 0 ? (
                  <div className="muted small">
                    You have no teams yet. That is fine, you do not need one. If
                    you do coach a squad, you can add it on the Teams tab and it
                    will appear here.
                  </div>
                ) : (
                  <div className="muted small">
                    Choosing a team lets this session appear in that team's weekly
                    and monthly reports.
                  </div>
                )}
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
            <button className="btn block" onClick={create} disabled={busy}>
              {busy ? <Spinner /> : "Start session"}
            </button>
        </>
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
