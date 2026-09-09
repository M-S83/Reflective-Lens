// One report per week, per month, per season, on a calendar everyone agrees on.
//
// For "one report a week" to mean anything, a week has to be THE week, not
// "the last 7 days from whenever you asked": before this, a Tuesday ask and a
// Thursday ask produced two different, overlapping weekly reports, each a
// model call, and generate-period-report inserted a fresh row every time.
//
// The rule now lives in three places that must agree, and this file holds
// them together:
//
//   - snapPeriod in generate-period-report, the AUTHORITY: any date in, the
//     calendar period out (Monday-to-Sunday week, calendar month, 1 August to
//     31 July season), then one row per period, regenerated in place when the
//     period's sessions changed and returned untouched (no model call) when
//     they did not.
//   - periodRange in web/src/lib/periods.ts, the calendar the coach sees.
//     They cannot import each other, so both are lifted and run here on the
//     same dates.
//   - migration 0031's unique index, the database's half, proven against a
//     real PG16 by one-report-per-period-db.sh.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const period = readFileSync(join(here, "../generate-period-report/index.ts"), "utf8");
const webPeriods = readFileSync(join(here, "../../../web/src/lib/periods.ts"), "utf8");
const webDb = readFileSync(join(here, "../../../web/src/lib/db.ts"), "utf8");
const reportsScreen = readFileSync(join(here, "../../../web/src/screens/Reports.tsx"), "utf8");
const migration = readFileSync(join(here, "../../migrations/0031_one_report_per_period.sql"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));
const code = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

console.log("one report per period, on one calendar");

// --- lift both implementations ------------------------------------------------
const stripTypes = (s) => s
  .replace(/export /g, "")
  .replace(/^import .*$/gm, "")
  .replace(/: \{ start: string; end: string \}/g, "")
  .replace(/: string\[\]\[\]/g, "").replace(/: string\[\]/g, "")
  .replace(/: PeriodType/g, "").replace(/: string/g, "")
  .replace(/: number/g, "").replace(/: Date/g, "");

const months = period.match(/const MONTHS = \[[\s\S]*?\];/)?.[0] ?? "";
const snapSrc = period.match(/function snapPeriod[\s\S]*?\n\}/)?.[0] ?? "";
const labelSrc = period.match(/function periodTitleLabel[\s\S]*?\n\}/)?.[0] ?? "";
const edge = eval(`(() => {${stripTypes(months + "\n" + snapSrc + "\n" + labelSrc)};
  return { snapPeriod, periodTitleLabel };})()`);

const web = eval(`(() => {${stripTypes(webPeriods)};
  return { periodRange, periodLabel, monthGrid, addDays, todayIso };})()`);

// --- the calendar itself -------------------------------------------------------
const cases = [
  // A Wednesday belongs to the Monday-to-Sunday week around it.
  ["weekly_report", "2026-09-09", "2026-09-07", "2026-09-13"],
  // A Monday is its own week's start; a Sunday reaches back six days.
  ["weekly_report", "2026-09-07", "2026-09-07", "2026-09-13"],
  ["weekly_report", "2026-09-13", "2026-09-07", "2026-09-13"],
  // A week can cross a month boundary and stays one week.
  ["weekly_report", "2026-08-31", "2026-08-31", "2026-09-06"],
  // A month is the calendar month, February included, leap year included.
  ["monthly_report", "2026-09-09", "2026-09-01", "2026-09-30"],
  ["monthly_report", "2026-02-14", "2026-02-01", "2026-02-28"],
  ["monthly_report", "2028-02-14", "2028-02-01", "2028-02-29"],
  ["monthly_report", "2026-12-31", "2026-12-01", "2026-12-31"],
  // The season runs 1 August to 31 July: 31 July is still LAST season, and
  // 1 August starts the next.
  ["season_report", "2026-09-09", "2026-08-01", "2027-07-31"],
  ["season_report", "2026-07-31", "2025-08-01", "2026-07-31"],
  ["season_report", "2026-08-01", "2026-08-01", "2027-07-31"],
];
for (const [kind, anchor, start, end] of cases) {
  const e = edge.snapPeriod(kind, anchor);
  ok(`${kind} ${anchor} -> ${start}..${end}`, e.start === start && e.end === end);
  const w = web.periodRange(kind, anchor);
  ok(`  and the web calendar agrees`, w.start === e.start && w.end === e.end);
}
// Every day of a week names the same week: the property that makes "one
// report per week" independent of which day the coach asks on.
{
  const starts = new Set();
  for (let i = 0; i < 7; i++) starts.add(edge.snapPeriod("weekly_report", web.addDays("2026-09-07", i)).start);
  ok("all seven days of a week name the same week", starts.size === 1);
}

// --- the period's name ---------------------------------------------------------
const labels = [
  ["weekly_report", "2026-09-07", "Week of 7 September 2026"],
  ["monthly_report", "2026-09-01", "September 2026"],
  ["season_report", "2026-08-01", "2026/27 season"],
];
for (const [kind, start, want] of labels) {
  ok(`label: ${want}`, edge.periodTitleLabel(kind, start) === want);
  ok(`  and the web agrees`, web.periodLabel(kind, start) === want);
}
ok("no dash in any label (house style)", labels.every(([k, s]) => !/[—–-]/.test(edge.periodTitleLabel(k, s))));

// --- the month grid the calendar draws -----------------------------------------
{
  const grid = web.monthGrid(2026, 8); // September 2026
  ok("grid is whole weeks of seven", grid.every((w) => w.length === 7));
  ok("grid starts on the Monday before the 1st", grid[0][0] === "2026-08-31");
  ok("grid reaches the last day", grid.flat().includes("2026-09-30"));
  ok("every row starts a Monday", grid.every((w) => edge.snapPeriod("weekly_report", w[0]).start === w[0]));
}

// --- the function keeps one row per period --------------------------------------
ok("the server snaps whatever it is sent", /const period = snapPeriod\(report_type, period_start\)/.test(code(period)));
ok("and queries the snapped range", /\.gte\("event_date", period\.start\)\.lte\("event_date", period\.end\)/.test(code(period)));
ok("it looks the period's report up before writing",
  /\.eq\("period_start", period\.start\)\.eq\("period_end", period\.end\)/.test(code(period)));
ok("an unchanged period returns the stored report, no model call",
  /prior\.source_fingerprint === fingerprint/.test(code(period)) && /unchanged: true/.test(code(period)));
ok("a changed period regenerates IN PLACE",
  /\.update\(row\)\.eq\("id", prior\.id\)/.test(code(period)));
ok("the fingerprint is versioned, so prompt fixes reach stored reports",
  /logic: PERIOD_LOGIC_VERSION/.test(code(period)) && /const PERIOD_LOGIC_VERSION = \d+/.test(code(period)));
ok("and is stored with the row", /source_fingerprint: fingerprint/.test(code(period)));
ok("the title names the period", /periodTitleLabel\(report_type, period\.start\)/.test(code(period)));

// --- the database holds the same rule -------------------------------------------
ok("0031 has the unique index", /create unique index if not exists reports_one_per_period/.test(migration));
ok("keyed on team, kind and period",
  /\(team_id, report_type, period_start, period_end\)/.test(migration));
ok("scoped to period reports only", /where event_id is null/.test(migration));
ok("older duplicates are tidied first, newest kept",
  migration.indexOf("delete from public.reports") < migration.indexOf("create unique index") &&
  /\(newer\.created_at, newer\.id\) > \(r\.created_at, r\.id\)/.test(migration));

// --- the screen shows the calendar, not a guess ----------------------------------
ok("there is a calendar", /function PeriodCalendar/.test(code(reportsScreen)));
ok("built from the shared period logic",
  /from "\.\.\/lib\/periods"/.test(reportsScreen) && /periodRange\(/.test(code(reportsScreen)));
ok("a week that has its report is marked", /reported\.has\(/.test(code(reportsScreen)));
ok("the future is not offered", /day > today/.test(code(reportsScreen)));
ok("the one-per-period rule is said to the coach", /One report\s+per week/.test(reportsScreen));
ok("an existing period offers an update, not a duplicate",
  /Bring it up to date/.test(reportsScreen));
// In the code, not the comments: the comment explaining what the rolling
// ranges WERE is allowed to name them.
ok("the rolling ranges are gone", !/last 7 days|last 30 days/.test(code(reportsScreen)));
ok("the client no longer sends its own period end", !/period_end/.test(code(webDb)));

// --- house style -----------------------------------------------------------------
ok("no em or en dashes in the new sources", ![webPeriods, migration].some((s) => /[—–]/.test(s)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
