import { useEffect, useMemo, useState } from "react";
import { TopBar, ErrorText, Loading, Markdown } from "../components/ui";
import {
  allReports, generatePeriodReport, myTeams,
  type PeriodType, type TeamWithClub,
} from "../lib/db";
import { MONTHS, monthGrid, periodLabel, periodRange, todayIso } from "../lib/periods";
import type { Report } from "../lib/types";
import { FEATURES, logFeature } from "../lib/features";

// Everything a coach has written up, in one place, plus the only way to ask for
// a period report.
//
// ONE REPORT PER PERIOD. A period is a calendar period (a Monday-to-Sunday
// week, a calendar month, an August-to-July season), picked on the calendar
// below, and each one has exactly one report: asking again for a period whose
// sessions have not changed hands back the same report, and a period with new
// sessions is brought up to date in place. The rule is enforced server-side
// (generate-period-report snaps the dates, migration 0031 holds one row per
// period); this screen's calendar is how a coach sees and picks the period,
// and sees which periods already have their report.
//
// Before this, "weekly" meant "the last 7 days from whenever you asked", so
// every tap of the button was a new, overlapping report and a new model call.

const PERIODS: { key: PeriodType; label: string }[] = [
  { key: "weekly_report", label: "Week" },
  { key: "monthly_report", label: "Month" },
  { key: "season_report", label: "Season" },
];

// ---- The calendar -----------------------------------------------------------
// Chalk rules apply: drawn lines, no shadows, --grass means "you can tap this"
// and the coach's yellow appears nowhere here, because a calendar is the app
// talking. Week mode: tap any day to pick its week. Month mode: the arrows
// pick the month, the grid is just the month shown. Season mode: arrows only.
// A small dot marks a week that already has its report. The future is not
// offered: there is nothing to look back over yet.
function PeriodCalendar({ kind, anchor, onAnchor, reported }: {
  kind: PeriodType;
  anchor: string;
  onAnchor: (dayIso: string) => void;
  reported: Set<string>;
}) {
  const today = todayIso();
  const sel = periodRange(kind, anchor);
  const a = new Date(`${anchor}T00:00:00Z`);
  // Week mode navigates months without moving the selection, so the view is
  // its own state; picking a day moves the selection into the viewed month.
  const [view, setView] = useState({ y: a.getUTCFullYear(), m: a.getUTCMonth() });
  useEffect(() => {
    const d = new Date(`${anchor}T00:00:00Z`);
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = new Date(`${today}T00:00:00Z`);
  const atCurrentMonth = (y: number, m: number) =>
    y > now.getUTCFullYear() || (y === now.getUTCFullYear() && m >= now.getUTCMonth());

  if (kind === "season_report") {
    const seasonY = Number(sel.start.slice(0, 4));
    const currentSeasonY = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    return (
      <div className="cal">
        <div className="cal-head">
          <button className="btn ghost sm" aria-label="Previous season"
            onClick={() => onAnchor(`${seasonY - 1}-08-01`)}>‹</button>
          <div className="cal-title">{periodLabel(kind, sel.start)}</div>
          <button className="btn ghost sm" aria-label="Next season"
            disabled={seasonY >= currentSeasonY}
            onClick={() => onAnchor(`${seasonY + 1}-08-01`)}>›</button>
        </div>
        <div className="muted small" style={{ textAlign: "center" }}>
          1 August {seasonY} to 31 July {seasonY + 1}
        </div>
      </div>
    );
  }

  const monthly = kind === "monthly_report";
  const y = monthly ? a.getUTCFullYear() : view.y;
  const m = monthly ? a.getUTCMonth() : view.m;
  const weeks = monthGrid(y, m);
  const firstOf = (yy: number, mm: number) =>
    `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
  const move = (delta: number) => {
    const ny = m + delta < 0 ? y - 1 : m + delta > 11 ? y + 1 : y;
    const nm = (m + delta + 12) % 12;
    if (monthly) onAnchor(firstOf(ny, nm));
    else setView({ y: ny, m: nm });
  };

  return (
    <div className="cal">
      <div className="cal-head">
        <button className="btn ghost sm" aria-label="Previous month" onClick={() => move(-1)}>‹</button>
        <div className="cal-title">{MONTHS[m]} {y}</div>
        <button className="btn ghost sm" aria-label="Next month"
          disabled={atCurrentMonth(y, m)} onClick={() => move(1)}>›</button>
      </div>
      <div className="cal-grid cal-dow-row">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="cal-dow">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="cal-grid">
          {week.map((day) => {
            const inMonth = Number(day.slice(5, 7)) - 1 === m;
            const future = day > today;
            const selected = day >= sel.start && day <= sel.end;
            const isMonday = day === periodRange("weekly_report", day).start;
            const hasReport = kind === "weekly_report" && isMonday &&
              reported.has(periodRange("weekly_report", day).start);
            return (
              <button
                key={day}
                className={`cal-day ${selected ? "sel" : ""} ${inMonth ? "" : "out"} ${future ? "future" : ""}`}
                disabled={future || monthly}
                onClick={() => onAnchor(day)}
                aria-label={day}
              >
                {Number(day.slice(8, 10))}
                {hasReport ? <span className="cal-dot" /> : <span className="cal-dot none" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const [list, setList] = useState<Report[] | null>(null);
  const [teams, setTeams] = useState<TeamWithClub[]>([]);
  const [teamId, setTeamId] = useState("");
  const [period, setPeriod] = useState<PeriodType>("weekly_report");
  const [anchor, setAnchor] = useState(todayIso());
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

  // What the calendar marks, and whether the picked period already has its one
  // report: same list, two questions.
  const sel = periodRange(period, anchor);
  const selLabel = periodLabel(period, sel.start);
  const reported = useMemo(() => new Set(
    periods
      .filter((r) => r.team_id === teamId && r.report_type === period && r.period_start)
      .map((r) => r.period_start as string),
  ), [periods, teamId, period]);
  const existing = periods.find((r) =>
    r.team_id === teamId && r.report_type === period &&
    r.period_start === sel.start && r.period_end === sel.end);

  const make = async () => {
    if (!teamId) return;
    setBusy(true); setErr(""); setNote("");
    try {
      const { report: r, unchanged } = await generatePeriodReport(teamId, period, anchor);
      logFeature(FEATURES.periodReportGenerated, { period });
      if (!r) {
        // The function returns null with a reason when the period is empty.
        // Saying so is better than an empty screen that looks broken.
        setNote("Nothing to report on for that period yet. Add a session or two first.");
      } else {
        if (unchanged) setNote("Nothing has changed since this report was built, so this is the same report.");
        setOpen(r.id);
      }
      await load();
    } catch (e) {
      setErr((e as Error).message ?? "Could not build that report.");
    } finally {
      setBusy(false);
    }
  };

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
            worked on in training against what you noted in matches. One report
            per week, one per month, one per season: pick the period on the
            calendar, and a small dot marks a week that already has its report.
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
              </div>

              <PeriodCalendar kind={period} anchor={anchor} onAnchor={setAnchor} reported={reported} />

              <div className="muted small">
                {existing
                  ? `${selLabel} already has its report, built ${fmt(existing.created_at)}. ` +
                    "Building again brings it up to date if the period's sessions changed, " +
                    "and costs nothing if they did not."
                  : `This builds ${selLabel}.`}
              </div>
              <button className="btn block" onClick={make} disabled={busy || !teamId}>
                {busy ? "Reading it back" : existing ? "Bring it up to date" : "Build the report"}
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
