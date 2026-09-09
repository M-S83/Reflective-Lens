-- =============================================================================
-- 0031_one_report_per_period.sql: a period has one report, not a pile of them.
--
-- generate-period-report inserted a NEW row on every call, and the periods
-- themselves were rolling ("the last 7 days", "the last 30 days"), so no two
-- requests even described the same stretch of season. Ask on Tuesday and again
-- on Thursday and you had two overlapping "weekly" reports, each a model call,
-- neither one THE week.
--
-- Periods are calendar periods now: a week is Monday to Sunday, a month is the
-- calendar month, a season runs 1 August to 31 July. The function snaps
-- whatever it is sent to those boundaries and keeps exactly one report per
-- (team, kind, period), regenerating it in place when the period's sessions
-- have changed, exactly as the single-session report has always done.
--
-- This index is the database's half of that rule. The function's lookup is the
-- polite path; the index is what makes "one report per week" true even against
-- a double-tap, a retried request, or the next caller that forgets to look.
--
-- Session reports are untouched: they hang off event_id and are excluded.
-- =============================================================================

-- Older duplicates first, or the unique index cannot be built. Rolling ranges
-- rarely collide, but a coach who asked for the same period twice in one day
-- has exact duplicates, and the newest is the one they most recently read.
-- Scoped to exactly the rows the index will cover, so nothing outside the
-- rule's reach can be deleted by the tidy-up that installs it.
delete from public.reports r
using public.reports newer
where r.event_id is null and newer.event_id is null
  and r.team_id is not null and r.team_id = newer.team_id
  and r.report_type = newer.report_type
  and r.period_start is not null and r.period_start = newer.period_start
  and r.period_end is not null and r.period_end = newer.period_end
  and (newer.created_at, newer.id) > (r.created_at, r.id);

create unique index if not exists reports_one_per_period
  on public.reports (team_id, report_type, period_start, period_end)
  where event_id is null
    and team_id is not null
    and period_start is not null
    and period_end is not null;

comment on index public.reports_one_per_period is
  'One period report per (team, kind, calendar period). '
  'generate-period-report regenerates the row in place; a second row for the '
  'same period is a bug, not a feature.';
