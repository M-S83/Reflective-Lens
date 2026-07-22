import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { generatePlayerSummary, playerSummaries } from "../lib/db";
import type { Report } from "../lib/types";
import { ErrorText, Loading, Markdown, Spinner, TopBar } from "../components/ui";

type Period = "weekly_report" | "monthly_report" | "season_report";
const iso = (d: Date) => d.toISOString().slice(0, 10);

// Sensible date range for each cadence, relative to today.
function range(period: Period): { start: string; end: string } {
  const now = new Date();
  const end = iso(now);
  if (period === "weekly_report") {
    const s = new Date(now); s.setDate(s.getDate() - 6);
    return { start: iso(s), end };
  }
  if (period === "monthly_report") {
    return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)), end };
  }
  // Season: August → this year, else previous year (Aug–May typical grassroots season).
  const seasonYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return { start: iso(new Date(seasonYear, 7, 1)), end };
}

export default function PlayerSummaries() {
  const nav = useNavigate();
  const [period, setPeriod] = useState<Period>("weekly_report");
  const [list, setList] = useState<Report[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    playerSummaries().then(setList).catch((e) => setErr((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setBusy(true); setErr(""); setNote("");
    try {
      const { start, end } = range(period);
      const r = await generatePlayerSummary(period, start, end);
      if (!r) setNote("No reflections in this period yet. Log a game and reflect, then try again.");
      load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="app">
      <TopBar title="My story" eyebrow="Player"
        right={<button className="btn ghost sm" onClick={() => nav("/player")}>Back</button>} />
      <div className="screen stack">
        <div className="card stack">
          <p className="muted small">A summary of your own reflections over time. What keeps showing in your
            game, what you keep working on, what's shifted. In your words.</p>
          <div className="chipset">
            <button className={`chip ${period === "weekly_report" ? "on" : ""}`} onClick={() => setPeriod("weekly_report")}>This week</button>
            <button className={`chip ${period === "monthly_report" ? "on" : ""}`} onClick={() => setPeriod("monthly_report")}>This month</button>
            <button className={`chip ${period === "season_report" ? "on" : ""}`} onClick={() => setPeriod("season_report")}>This season</button>
          </div>
          <button className="btn" onClick={generate} disabled={busy}>
            {busy ? <Spinner /> : "Build my summary"}
          </button>
          {note && <div className="banner warn">{note}</div>}
          <ErrorText>{err}</ErrorText>
        </div>

        {list === null ? <Loading /> : list.length === 0 ? (
          <div className="card muted">No summaries yet.</div>
        ) : (
          list.map((r) => (
            <div key={r.id} className="card">
              {r.content_markdown ? <Markdown text={r.content_markdown} /> : <span className="muted">Empty.</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
