import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { playerGames, type PlayerGameRow } from "../lib/db";
import { useAuth } from "../auth/AuthProvider";
import { ErrorText, Loading, TopBar } from "../components/ui";
import { ModeSwitch } from "../components/ModeSwitch";

function fmtDate(d: string | null) {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" }); }
  catch { return d; }
}

export default function PlayerHome() {
  const { signOut } = useAuth();
  const nav = useNavigate();
  const [games, setGames] = useState<PlayerGameRow[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => { playerGames().then(setGames).catch((e) => setErr((e as Error).message)); }, []);

  return (
    <div className="app">
      <TopBar
        title="Reflective Lens"
        eyebrow="Player"
        right={<div className="row" style={{ gap: 6 }}><ModeSwitch /><button className="btn ghost sm" onClick={() => signOut()}>Sign out</button></div>}
      />
      <div className="screen stack">
        <div className="banner">Your reflections are private, just for you. No coach or club sees them.</div>

        <button className="btn block" onClick={() => nav("/player/log")}>+ Log a game</button>

        <div>
          <div className="row" style={{ marginBottom: 8 }}>
            <h2 className="serif" style={{ fontSize: 16, color: "var(--pitch)" }}>Your games</h2>
            <div className="spacer" />
            <button className="btn ghost sm" onClick={() => nav("/player/summaries")}>My story</button>
          </div>
          <ErrorText>{err}</ErrorText>
          {games === null ? <Loading /> : games.length === 0 ? (
            <div className="card muted">Nothing yet. Log your first game: how it went and where you played,
              then reflect on it in your own words.</div>
          ) : (
            <div className="list">
              {games.map((g) => (
                <button key={g.id} className="card tap" onClick={() => nav(`/player/game/${g.event_id}`)}>
                  <div className="row">
                    <strong>{g.events?.title ?? "Game"}</strong>
                    <div className="spacer" />
                    {g.result && <span className={`pill ${g.result === "win" ? "good" : g.result === "loss" ? "crit" : ""}`}>{g.result}</span>}
                  </div>
                  <div className="muted small row" style={{ gap: 8, marginTop: 4 }}>
                    {g.positions?.length > 0 && <span>{g.positions.join(", ")}</span>}
                    {g.goals_for != null && g.goals_against != null && <span>· {g.goals_for}-{g.goals_against}</span>}
                    {g.events?.event_date && <span>· {fmtDate(g.events.event_date)}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
