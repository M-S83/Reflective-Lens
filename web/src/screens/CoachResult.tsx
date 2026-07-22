import { useCallback, useEffect, useState } from "react";
import {
  getMatchDetails, getMatchStats, saveMatchDetails, setMatchStat, squad, type SquadRow,
} from "../lib/db";
import { HOME_AWAY, type HomeAway, type MatchDetails, type MatchStat } from "../lib/types";
import { ErrorText, Loading } from "../components/ui";

function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <button className="btn subtle sm" style={{ width: 30, padding: "4px 0" }}
        onClick={() => onChange(Math.max(min, value - 1))} aria-label="minus">−</button>
      <span className="mono" style={{ minWidth: 16, textAlign: "center" }}>{value}</span>
      <button className="btn subtle sm" style={{ width: 30, padding: "4px 0" }}
        onClick={() => onChange(value + 1)} aria-label="plus">+</button>
    </span>
  );
}

const zeroStat = (event_id: string, player_id: string): MatchStat => ({
  event_id, player_id, goals: 0, assists: 0, yellow_cards: 0, red_cards: 0, clean_sheet: false, minutes_played: null,
});

export function CoachResult({ eventId, teamId }: { eventId: string; teamId: string }) {
  const [rows, setRows] = useState<SquadRow[] | null>(null);
  const [d, setD] = useState<MatchDetails>({
    event_id: eventId, home_away: null, formation: null, goals_for: 0, goals_against: 0,
    man_of_the_match: null, notes: null,
  });
  const [stats, setStats] = useState<Record<string, MatchStat>>({});
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [sq, md, ms] = await Promise.all([squad(eventId, teamId), getMatchDetails(eventId), getMatchStats(eventId)]);
      setRows(sq);
      if (md) setD({ ...md, event_id: eventId });
      const map: Record<string, MatchStat> = {};
      for (const s of ms) map[s.player_id] = s;
      setStats(map);
    } catch (e) { setErr((e as Error).message); }
  }, [eventId, teamId]);
  useEffect(() => { load(); }, [load]);

  if (rows === null) return <Loading />;

  const playing = (() => {
    const present = rows.filter((r) => r.status === "present");
    return present.length ? present : rows;
  })();

  const saveDetails = async (patch: Partial<MatchDetails>) => {
    const next = { ...d, ...patch };
    setD(next);
    try { await saveMatchDetails(next); } catch (e) { setErr((e as Error).message); }
  };

  const stat = (pid: string) => stats[pid] ?? zeroStat(eventId, pid);
  const saveStat = async (pid: string, patch: Partial<MatchStat>) => {
    const next = { ...stat(pid), ...patch };
    setStats((s) => ({ ...s, [pid]: next }));
    try { await setMatchStat(next); } catch (e) { setErr((e as Error).message); }
  };

  const nameOf = (pid: string) => rows.find((r) => r.player.id === pid)?.player.display_name ?? "";

  return (
    <>
      <div className="card stack">
        <h2 className="serif">The score</h2>
        <div className="row" style={{ justifyContent: "center", gap: 16 }}>
          <div className="stack" style={{ alignItems: "center", gap: 4 }}>
            <span className="muted small">Us</span>
            <Stepper value={d.goals_for} onChange={(n) => saveDetails({ goals_for: n })} />
          </div>
          <span className="mono muted">v</span>
          <div className="stack" style={{ alignItems: "center", gap: 4 }}>
            <span className="muted small">Them</span>
            <Stepper value={d.goals_against} onChange={(n) => saveDetails({ goals_against: n })} />
          </div>
        </div>
        <div className="chipset" style={{ justifyContent: "center" }}>
          {HOME_AWAY.map((h) => (
            <button key={h.value} className={`chip ${d.home_away === h.value ? "on" : ""}`}
              onClick={() => saveDetails({ home_away: h.value as HomeAway })}>{h.label}</button>
          ))}
        </div>
        <div className="field"><label>Formation</label>
          <input value={d.formation ?? ""} placeholder="e.g. 4-3-3"
            onChange={(e) => setD({ ...d, formation: e.target.value })}
            onBlur={() => saveDetails({ formation: d.formation })} /></div>
        <div className="field"><label>Player of the match</label>
          <select value={d.man_of_the_match ?? ""} onChange={(e) => saveDetails({ man_of_the_match: e.target.value || null })}>
            <option value="">Not chosen</option>
            {playing.map((r) => <option key={r.player.id} value={r.player.id}>{r.player.display_name}</option>)}
          </select></div>
      </div>

      <div className="card stack">
        <h2 className="serif">Who did what</h2>
        <p className="muted small">Goals, assists, cards and clean sheets for the players who featured.</p>
        <ErrorText>{err}</ErrorText>
        {playing.map((r) => {
          const s = stat(r.player.id);
          return (
            <div key={r.player.id} className="card stack" style={{ gap: 8 }}>
              <strong>{r.player.display_name}</strong>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="muted small">Goals</span>
                <Stepper value={s.goals} onChange={(n) => saveStat(r.player.id, { goals: n })} />
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="muted small">Assists</span>
                <Stepper value={s.assists} onChange={(n) => saveStat(r.player.id, { assists: n })} />
              </div>
              <div className="chipset">
                <button className={`chip ${s.yellow_cards ? "on" : ""}`}
                  onClick={() => saveStat(r.player.id, { yellow_cards: s.yellow_cards ? 0 : 1 })}>Yellow</button>
                <button className={`chip ${s.red_cards ? "on" : ""}`}
                  onClick={() => saveStat(r.player.id, { red_cards: s.red_cards ? 0 : 1 })}>Red</button>
                <button className={`chip ${s.clean_sheet ? "on" : ""}`}
                  onClick={() => saveStat(r.player.id, { clean_sheet: !s.clean_sheet })}>Clean sheet</button>
              </div>
            </div>
          );
        })}
      </div>

      {d.man_of_the_match && (
        <div className="banner">Player of the match: {nameOf(d.man_of_the_match)}</div>
      )}
    </>
  );
}
