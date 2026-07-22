import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addPlayer, players } from "../lib/db";
import type { Player } from "../lib/types";
import { ErrorText, Loading, Spinner, TopBar } from "../components/ui";

export default function TeamDetail() {
  const { teamId } = useParams();
  const nav = useNavigate();
  const [list, setList] = useState<Player[] | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [shirt, setShirt] = useState("");
  const [pos, setPos] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => players(teamId!).then(setList).catch((e) => setErr((e as Error).message));
  useEffect(() => { if (teamId) load(); /* eslint-disable-next-line */ }, [teamId]);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true); setErr("");
    try {
      await addPlayer(teamId!, name.trim(), shirt ? Number(shirt) : null, pos.trim());
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
        <div className="card stack">
          <h2 className="serif">Add a player</h2>
          <div className="field"><label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ width: 90 }}><label>Shirt</label>
              <input inputMode="numeric" value={shirt} onChange={(e) => setShirt(e.target.value)} placeholder="7" /></div>
            <div className="field" style={{ flex: 1 }}><label>Position</label>
              <input value={pos} onChange={(e) => setPos(e.target.value)} placeholder="CM" /></div>
          </div>
          <ErrorText>{err}</ErrorText>
          <button className="btn" onClick={add} disabled={busy || !name}>
            {busy ? <Spinner /> : "Add player"}
          </button>
        </div>

        {list === null ? <Loading /> : (
          <div className="list">
            {list.map((p) => (
              <div key={p.id} className="card row">
                <span className="mono" style={{ width: 30, color: "var(--muted)" }}>{p.shirt_number ?? "-"}</span>
                <strong>{p.display_name}</strong>
                <div className="spacer" />
                {p.position && <span className="pill">{p.position}</span>}
              </div>
            ))}
            {list.length === 0 && <div className="card muted">No players yet. Add your squad above.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
