import { useEffect, useMemo, useState } from "react";
import { TopBar, ErrorText, Loading, Markdown } from "../components/ui";
import {
  allReports, generatePeriodReport, myTeams,
  type PeriodType, type TeamWithClub,
} from "../lib/db";
import type { Report } from "../lib/types";
import { FEATURES, logFeature } from "../lib/features";

// Everything a coach has written up, in one place, plus the only way to ask for
// a period report.
//
// Two gaps this closes. Reports were only ever reachable from the session that
// produced them, so a coach with a season's work had no way to look back over
// it. And generate-period-report, which has been deployed from the start, had no
// caller at all: the weekly, monthly and season picture simply could not be
// asked for from the app.

// The periods on offer. Ranges are worked out from today rather than asked for,
// because "which twelve dates do you want" is not a question a coach should have
// to answer to see their month.
const PERIODS: { key: PeriodType; label: string; blurb: string }[] = [
  { key: "weekly_report", label: "This week", blurb: "the last 7 days" },
  { key: "monthly_report", label: "This month", blurb: "the last 30 days" },
  { key: "season_report", label: "This season", blurb: "since August" },
];

function rangeFor(kind: PeriodType): { start: string; end: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (kind === "season_report") {
    // Grassroots seasons run August to May, so before August we are still in
    // the season that started the previous year.
    const year = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
    return { start: `${year}-08-01`, end: iso(today) };
  }
  const days = kind === "weekly_report" ? 7 : 30;
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  return { start: iso(from), end: iso(today) };
}

export default function Reports() {
  const [list, setList] = useState<Report[] | null>(null);
  const [teams, setTeams] = useState<TeamWithClub[]>([]);
  const [teamId, setTeamId] = useState("");
  const [period, setPeriod] = useState<PeriodType>("monthly_report");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const load = () => allReports().then(setList).catch((e) => {
    setErr((e as Error).message ?? "Could not load your reports.");
    setList([]);
  });

  useEffect(() => {
    load();
    myTeams().then((t) => { setTeams(t); if (t[0]) setTeamId(t[0].id); }).catch(() => {});
  }, []);

  const make = async () => {
    if (!teamId) return;
    setBusy(true); setErr(""); setNote("");
    try {
      const { start, end } = rangeFor(period);
      const r = await generatePeriodReport(teamId, period, start, end);
      logFeature(FEATURES.periodReportGenerated, { period });
      if (!r) {
        // The function returns null with a reason when the period is empty.
        // Saying so is better than an empty screen that looks broken.
        setNote("Nothing to report on for that period yet. Add a session or two first.");
      } else {
        setOpen(r.id);
      }
      await load();
    } catch (e) {
      setErr((e as Error).message ?? "Could not build that report.");
    } finally {
      setBusy(false);
    }
  };

  // Period reports have no event; session reports do. Worth separating, because
  // they answer different questions and a coach looking for their month should
  // not have to pick it out of a list of sessions.
  const { periods, sessions } = useMemo(() => {
    const all = list ?? [];
    return {
      periods: all.filter((r) => !r.event_id),
      sessions: all.filter((r) => r.event_id),
    };
  }, [list]);

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  const Card = ({ r }: { r: Report }) => (
    <div className="card stack" style={{ gap: 6 }}>
      <button
        className="row"
        onClick={() => setOpen(open === r.id ? null : r.id)}
        style={{ background: "none", border: 0, padding: 0, cursor: "pointer", width: "100%", textAlign: "left" }}
      >
        <strong>{r.title}</strong>
        <div className="spacer" />
        <span className="muted small">{fmt(r.created_at)}</span>
      </button>
      {open === r.id && (
        <div className="md" style={{ marginTop: 4 }}>
          <Markdown text={r.content_markdown ?? ""} />
        </div>
      )}
    </div>
  );

  return (
    <div className="app">
      <TopBar title="Reports" eyebrow="Everything you have written up" />
      <div className="screen stack">
        <ErrorText>{err}</ErrorText>

        {/* --- Build a period report ------------------------------------ */}
        <div className="card stack">
          <strong>Look back over a period</strong>
          <div className="muted small">
            Gathers a team's sessions into one picture, and compares what you
            worked on in training against what you noted in matches. Sessions you
            named yourself are kept separate, so a goalkeeping block does not get
            read as the team's training.
          </div>

          {teams.length === 0 ? (
            <div className="muted small">
              You need a team for this one, since a period report covers a team's
              sessions. Add one on the Teams tab.
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="rep-team">Team</label>
                <select id="rep-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}, {t.club?.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Period</label>
                <div className="chipset">
                  {PERIODS.map((p) => (
                    <button
                      key={p.key}
                      className={`chip ${period === p.key ? "on" : ""}`}
                      onClick={() => setPeriod(p.key)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="muted small" style={{ marginTop: 4 }}>
                  {PERIODS.find((p) => p.key === period)?.blurb}
                </div>
              </div>
              <button className="btn block" onClick={make} disabled={busy || !teamId}>
                {busy ? "Reading it back" : "Build the report"}
              </button>
              {note && <div className="banner">{note}</div>}
            </>
          )}
        </div>

        {/* --- What exists already --------------------------------------- */}
        {list === null ? (
          <Loading />
        ) : list.length === 0 ? (
          <div className="card muted">
            Nothing yet. Reports appear here once you have reflected on a session
            and generated one.
          </div>
        ) : (
          <>
            {periods.length > 0 && (
              <div>
                <h2 className="serif" style={{ fontSize: 16, color: "var(--pitch)", marginBottom: 8 }}>
                  Over a period
                </h2>
                <div className="list">{periods.map((r) => <Card key={r.id} r={r} />)}</div>
              </div>
            )}
            {sessions.length > 0 && (
              <div>
                <h2 className="serif" style={{ fontSize: 16, color: "var(--pitch)", marginBottom: 8 }}>
                  Single sessions
                </h2>
                <div className="list">{sessions.map((r) => <Card key={r.id} r={r} />)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
