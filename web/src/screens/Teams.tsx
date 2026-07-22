import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createClubAndTeam, myTeams, type TeamWithClub } from "../lib/db";
import { FORMATS, type TeamFormat } from "../lib/types";
import { ErrorText, Loading, Spinner, TopBar } from "../components/ui";

export default function Teams() {
  const nav = useNavigate();
  const [teams, setTeams] = useState<TeamWithClub[] | null>(null);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [club, setClub] = useState("");
  const [team, setTeam] = useState("");
  const [age, setAge] = useState("");
  const [format, setFormat] = useState<TeamFormat>("9v9");
  const [busy, setBusy] = useState(false);

  const load = () => myTeams().then(setTeams).catch((e) => setErr((e as Error).message));
  useEffect(() => { load(); }, []);

  const create = async () => {
    setErr(""); setBusy(true);
    try {
      await createClubAndTeam(club.trim(), team.trim(), format, age.trim());
      setClub(""); setTeam(""); setAge(""); setAdding(false);
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="app">
      <TopBar title="Teams" eyebrow="Your clubs & teams" />
      <div className="screen stack">
        {teams === null ? <Loading /> : (
          <div className="list">
            {teams.map((t) => (
              <button key={t.id} className="card tap" onClick={() => nav(`/teams/${t.id}`)}>
                <div className="row">
                  <strong>{t.name}</strong>
                  <div className="spacer" />
                  <span className="pill">{t.format}</span>
                </div>
                <div className="muted small" style={{ marginTop: 4 }}>
                  {t.club?.name}{t.age_group ? ` · ${t.age_group}` : ""}
                </div>
              </button>
            ))}
            {teams.length === 0 && !adding && (
              <div className="card muted">No teams yet. Add one to get started. You can add as many
                clubs and teams as you like and reflect on each separately.</div>
            )}
          </div>
        )}

        {adding ? (
          <div className="card stack">
            <h2 className="serif">New team</h2>
            <div className="field"><label>Club name</label>
              <input value={club} onChange={(e) => setClub(e.target.value)} placeholder="e.g. Riverside FC" /></div>
            <div className="field"><label>Team name</label>
              <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="e.g. U12 Lions" /></div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field" style={{ flex: 1 }}><label>Age group</label>
                <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="U12" /></div>
              <div className="field" style={{ flex: 1 }}><label>Format</label>
                <select value={format} onChange={(e) => setFormat(e.target.value as TeamFormat)}>
                  {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select></div>
            </div>
            <ErrorText>{err}</ErrorText>
            <div className="row">
              <button className="btn" onClick={create} disabled={busy || !club || !team}>
                {busy ? <Spinner /> : "Create team"}
              </button>
              <button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn ghost block" onClick={() => setAdding(true)}>+ Add a club / team</button>
        )}
        <ErrorText>{!adding ? err : ""}</ErrorText>
      </div>
    </div>
  );
}
