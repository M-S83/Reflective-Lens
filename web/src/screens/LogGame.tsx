import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPlayerGame } from "../lib/db";
import { HOME_AWAY, ROLES, type HomeAway, type PlayerMatchRole } from "../lib/types";
import { ErrorText, Spinner, TopBar } from "../components/ui";

export default function LogGame() {
  const nav = useNavigate();
  const [isMatch, setIsMatch] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [opposition, setOpposition] = useState("");
  const [homeAway, setHomeAway] = useState<HomeAway>("home");
  const [positions, setPositions] = useState<string[]>([]);
  const [posDraft, setPosDraft] = useState("");
  const [role, setRole] = useState<PlayerMatchRole>("started");
  const [gf, setGf] = useState("");
  const [ga, setGa] = useState("");
  const [minutes, setMinutes] = useState("");
  const [myGoals, setMyGoals] = useState("");
  const [myAssists, setMyAssists] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const addPos = () => {
    const v = posDraft.trim();
    if (v) { setPositions((p) => [...p, v]); setPosDraft(""); }
  };
  const num = (s: string): number | null => (s.trim() === "" ? null : Number(s));

  const save = async () => {
    setErr(""); setBusy(true);
    try {
      const title = isMatch
        ? (opposition ? `Game vs ${opposition}` : "Match")
        : "Training";
      const eventId = await createPlayerGame({
        is_match: isMatch, title, event_date: date, opposition,
        home_away: isMatch ? homeAway : null, positions, role,
        goals_for: isMatch ? num(gf) : null, goals_against: isMatch ? num(ga) : null,
        minutes: num(minutes), my_goals: num(myGoals) ?? 0, my_assists: num(myAssists) ?? 0,
      });
      nav(`/player/game/${eventId}`);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="app">
      <TopBar title="Log a game" eyebrow="Player"
        right={<button className="btn ghost sm" onClick={() => nav("/player")}>Cancel</button>} />
      <div className="screen stack">
        <div className="card stack">
          <div className="chipset">
            <button className={`chip ${isMatch ? "on" : ""}`} onClick={() => setIsMatch(true)}>Match</button>
            <button className={`chip ${!isMatch ? "on" : ""}`} onClick={() => setIsMatch(false)}>Training</button>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            {isMatch && (
              <div className="field" style={{ flex: 1 }}><label>Opposition</label>
                <input value={opposition} onChange={(e) => setOpposition(e.target.value)} placeholder="Opponent" /></div>
            )}
          </div>

          <div className="field">
            <label>Position(s) you played</label>
            <div className="row">
              <input value={posDraft} onChange={(e) => setPosDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPos(); } }}
                placeholder="e.g. CM" />
              <button className="btn subtle sm" onClick={addPos}>Add</button>
            </div>
            {positions.length > 0 && (
              <div className="tags" style={{ marginTop: 8 }}>
                {positions.map((p, i) => (
                  <span key={i} className="tag" style={{ cursor: "pointer" }}
                    onClick={() => setPositions((x) => x.filter((_, j) => j !== i))}>{p} ✕</span>
                ))}
              </div>
            )}
          </div>

          <div className="field"><label>How you featured</label>
            <div className="chipset">
              {ROLES.map((r) => (
                <button key={r.value} className={`chip ${role === r.value ? "on" : ""}`} onClick={() => setRole(r.value)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isMatch && (
          <div className="card stack">
            <h2 className="serif">The game</h2>
            <div className="field"><label>Home / Away</label>
              <div className="chipset">
                {HOME_AWAY.map((h) => (
                  <button key={h.value} className={`chip ${homeAway === h.value ? "on" : ""}`} onClick={() => setHomeAway(h.value)}>
                    {h.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field" style={{ flex: 1 }}><label>Goals for</label>
                <input inputMode="numeric" value={gf} onChange={(e) => setGf(e.target.value)} placeholder="0" /></div>
              <div className="field" style={{ flex: 1 }}><label>Goals against</label>
                <input inputMode="numeric" value={ga} onChange={(e) => setGa(e.target.value)} placeholder="0" /></div>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field" style={{ flex: 1 }}><label>Your goals</label>
                <input inputMode="numeric" value={myGoals} onChange={(e) => setMyGoals(e.target.value)} placeholder="0" /></div>
              <div className="field" style={{ flex: 1 }}><label>Your assists</label>
                <input inputMode="numeric" value={myAssists} onChange={(e) => setMyAssists(e.target.value)} placeholder="0" /></div>
              <div className="field" style={{ flex: 1 }}><label>Minutes</label>
                <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="" /></div>
            </div>
          </div>
        )}

        <ErrorText>{err}</ErrorText>
        <button className="btn block" onClick={save} disabled={busy}>
          {busy ? <Spinner /> : "Save & reflect"}
        </button>
      </div>
    </div>
  );
}
