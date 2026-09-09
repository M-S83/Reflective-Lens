// =============================================================================
// lib/periods.ts: the calendar the period reports live on.
//
// One report per week, per month, per season. For that to be true, a period
// has to be a CALENDAR period rather than "the last 7 days from whenever you
// asked": a week is Monday to Sunday, a month is the calendar month, a season
// runs 1 August to 31 July.
//
// MIRRORS snapPeriod / periodTitleLabel in
// supabase/functions/generate-period-report/index.ts. The server's copy is the
// authoritative one (it snaps whatever it is sent); this one exists so the
// calendar on the Reports screen shows the coach exactly the period the server
// will use. They cannot import each other, so
// _tests/one-report-per-period.mjs holds them together.
//
// All date arithmetic is on Y-M-D strings via UTC, because a period boundary
// must not move with the phone's timezone.
// =============================================================================
import type { PeriodType } from "./db";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function periodRange(kind: PeriodType, anchorIso: string): { start: string; end: string } {
  const d = new Date(`${anchorIso}T00:00:00Z`);
  if (kind === "season_report") {
    const y = d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return { start: `${y}-08-01`, end: `${y + 1}-07-31` };
  }
  if (kind === "monthly_report") {
    return {
      start: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))),
      end: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))),
    };
  }
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: iso(monday), end: iso(sunday) };
}

// The period's name, as the report will be titled. No dashes (house style).
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
export function periodLabel(kind: PeriodType, startIso: string): string {
  const d = new Date(`${startIso}T00:00:00Z`);
  if (kind === "season_report") {
    const y = d.getUTCFullYear();
    return `${y}/${String((y + 1) % 100).padStart(2, "0")} season`;
  }
  if (kind === "monthly_report") return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `Week of ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Day arithmetic for the calendar itself.
export function addDays(dayIso: string, n: number): string {
  const d = new Date(`${dayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

export function todayIso(): string {
  return iso(new Date());
}

// The weeks of one month, Monday-start, padded to whole weeks so the grid is
// always rectangles of seven. Returns ISO day strings.
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(Date.UTC(year, month, 1));
  let cursor = addDays(iso(first), -((first.getUTCDay() + 6) % 7));
  const weeks: string[][] = [];
  const lastIso = iso(new Date(Date.UTC(year, month + 1, 0)));
  while (cursor <= lastIso) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) { week.push(cursor); cursor = addDays(cursor, 1); }
    weeks.push(week);
  }
  return weeks;
}
