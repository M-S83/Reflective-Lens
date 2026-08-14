import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addPlayer, getTeam, parsePositions, players, setTeamAgeGroup, updatePlayer } from "../lib/db";
import type { Player } from "../lib/types";
import { AGE_GROUPS, ADULT_AGE_GROUP } from "../lib/types";
import { ErrorText, Loading, Spinner, TopBar } from "../components/ui";

// A squad row that can have its positions changed without leaving the screen.
// Adding them was possible before and changing them was not, so a player signed
// up in August as a centre half was one for the season.
function PlayerRow({ player, onSaved, onError }: {
  player: Player; onSaved: () => void; onError: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState((player.positions ?? []).join(", "));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updatePlayer(player.id, { positions: parsePositions(text) });
      setEditing(false);
      onSaved();
    } catch (e) { onError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="row">
        <span className="mono" style={{ width: 30, color: "var(--muted)" }}>{player.shirt_number ?? "-"}</span>
        <strong>{player.display_name}</strong>
        <div className="spacer" />
        {!editing && (player.positions ?? []).map((p) => <span key={p} className="pill">{p}</span>)}
        {!editing && (
          <button className="btn small ghost" onClick={() => setEditing(true)}
            aria-label={`Change positions for ${player.display_name}`}>
            {(player.positions ?? []).length ? "Change" : "Add positions"}
          </button>
        )}
      </div>
      {editing && (
        <div className="row" style={{ gap: 8 }}>
          <input style={{ flex: 1 }} value={text} autoFocus
            onChange={(e) => setText(e.target.value)} placeholder="CM, RB" />
          <button className="btn small" onClick={save} disabled={busy}>{busy ? <Spinner /> : "Save"}</button>
          <button className="btn small ghost" onClick={() => {
            setText((player.positions ?? []).join(", "));
            setEditing(false);
          }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

export default function TeamDetail() {
  const { teamId } = useParams();
  const nav = useNavigate();
  const [list, setList] = useState<Player[] | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [shirt, setShirt] = useState("");
  const [pos, setPos] = useState("");
  const [busy, setBusy] = useState(false);
  const [age, setAge] = useState<string | null>(null);

  const load = () => players(teamId!).then(setList).catch((e) => setErr((e as Error).message));
  useEffect(() => { if (teamId) load(); /* eslint-disable-next-line */ }, [teamId]);
  useEffect(() => {
    if (teamId) getTeam(teamId).then((t) => setAge(t.age_group ?? "")).catch(() => setAge(""));
  }, [teamId]);

  const saveAge = async (next: string) => {
    setAge(next);
    setErr("");
    try { await setTeamAgeGroup(teamId!, next); }
    catch (e) { setErr((e as Error).message); }
  };

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true); setErr("");
    try {
      await addPlayer(teamId!, name.trim(), shirt ? Number(shirt) : null, parsePositions(pos));
      setName(""); setShirt(""); setPos("");
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="app">
      <TopBar title="Squad" eyebrow="Players"
        right={<button className="btn ghost sm" onClick={() => nav("/teams")}>Back</button>} />
      <div className="screen stack">
        {/* The age group decides whether this squad's surnames are allowed to
            leave the app, so it has to be changeable and it has to say what it
            does. Anything the app does not recognise, including the free text
            typed before this was a chooser, counts as under-18. */}
        <div className="card stack">
          <strong>Age group</strong>
          {age === null ? <Loading /> : (
            <>
              <select value={AGE_GROUPS.includes(age) ? age : ""} onChange={(e) => saveAge(e.target.value)}>
                <option value="" disabled>{age ? `${age} (not recognised)` : "Choose one"}</option>
                {AGE_GROUPS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <div className="muted small">
                {age === ADULT_AGE_GROUP
                  ? "An adult squad, so players are named in full in your reports."
                  : "Under 18, so players appear by first name only, and surnames are removed from what you say before anything is written."}
              </div>
            </>
          )}
        </div>

        <div className="card stack">
          <h2 className="serif">Add a player</h2>
          <div className="field"><label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ width: 90 }}><label>Shirt</label>
              <input inputMode="numeric" value={shirt} onChange={(e) => setShirt(e.target.value)} placeholder="7" /></div>
            {/* More than one, separated however the coach already separates
                them. Their words, not a fixed list: someone who says "left
                eight" means something by it. */}
            <div className="field" style={{ flex: 1 }}><label>Positions</label>
              <input value={pos} onChange={(e) => setPos(e.target.value)} placeholder="CM, RB" /></div>
          </div>
          <div className="muted small">Add as many as they play, separated by commas.</div>
          <ErrorText>{err}</ErrorText>
          <button className="btn" onClick={add} disabled={busy || !name}>
            {busy ? <Spinner /> : "Add player"}
          </button>
        </div>

        {list === null ? <Loading /> : (
          <div className="list">
            {list.map((p) => (
              <PlayerRow key={p.id} player={p} onSaved={load} onError={setErr} />
            ))}
            {list.length === 0 && <div className="card muted">No players yet. Add your squad above.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
