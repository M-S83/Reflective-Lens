#!/usr/bin/env bash
# Runnable PG16 check: one period report per (team, kind, calendar period).
#
# The function's lookup-then-update is the polite path; this proves the
# database holds the rule on its own, against a double-tap, a retried request,
# or a future caller that forgets to look. And it proves the rule stops where
# it should: session reports hang off event_id and are not rationed, and the
# same period for a different kind (a week inside its month) is not a clash.
#
# The migration's tidy-up is tested the only way it can be: duplicates are
# seeded BEFORE 0031 runs, and the newest one must be the survivor.
set -euo pipefail
WORK="/var/tmp/rlpg_period"; SOCK="$WORK/sock"
BOOT="${BOOT:-$(dirname "$0")/bootstrap.sql}"
rm -rf "$WORK"; mkdir -p "$WORK/sock"
cp "$BOOT" "$WORK/bootstrap.sql"
cat >> "$WORK/bootstrap.sql" <<'SQL'
alter table auth.users add column if not exists phone text;
alter table auth.users add column if not exists raw_user_meta_data jsonb default '{}'::jsonb;
SQL
cp "$(dirname "$0")"/../../migrations/*.sql "$WORK/"
chown -R postgres:postgres "$WORK"
sudo -u postgres /usr/lib/postgresql/16/bin/initdb -D "$WORK/pgdata" -U postgres >/dev/null 2>&1
sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$WORK/pgdata" \
  -o "-k $SOCK -p 5435 -c listen_addresses=''" -l "$WORK/pg.log" -w start >/dev/null 2>&1
P="sudo -u postgres /usr/lib/postgresql/16/bin/psql -h $SOCK -p 5435 -U postgres -d postgres -v ON_ERROR_STOP=1 -X -tA"
$P -f "$WORK/bootstrap.sql" >/dev/null

# Everything BEFORE 0031, so duplicates can still be seeded.
for f in "$WORK"/0*.sql; do
  [ "$(basename "$f")" = "0031_one_report_per_period.sql" ] && continue
  $P -f "$f" >/dev/null
done

fail=0
chk() { if [ "$2" = "$3" ]; then echo "PASS: $1"; else echo "FAIL: $1 (got '$2', want '$3')"; fail=1; fi; }

# Seed: a coach, a club, a team, and the duplicate weekly reports 0031 must
# tidy. Distinct created_at so "keep the newest" is a real assertion.
$P >/dev/null <<'SQL'
insert into auth.users (id,email,raw_user_meta_data)
  values ('77777777-7777-7777-7777-777777777777','period@test','{"role":"coach"}');
insert into public.clubs (id, name, created_by)
  values ('d0000000-0000-0000-0000-000000000001','Period FC','77777777-7777-7777-7777-777777777777');
insert into public.teams (id, club_id, name, age_group, format, created_by)
  values ('d0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001','U13','U13','9v9','77777777-7777-7777-7777-777777777777');
insert into public.reports (id, event_id, team_id, created_by, report_type, title, period_start, period_end, created_at) values
  ('a0000000-0000-0000-0000-000000000001', null, 'd0000000-0000-0000-0000-000000000002','77777777-7777-7777-7777-777777777777','weekly_report','older duplicate','2026-09-07','2026-09-13','2026-09-08T10:00:00Z'),
  ('a0000000-0000-0000-0000-000000000002', null, 'd0000000-0000-0000-0000-000000000002','77777777-7777-7777-7777-777777777777','weekly_report','newer duplicate','2026-09-07','2026-09-13','2026-09-09T10:00:00Z');
SQL

# Now the migration under test.
$P -f "$WORK/0031_one_report_per_period.sql" >/dev/null

N=$($P -c "select count(*) from public.reports where team_id='d0000000-0000-0000-0000-000000000002' and report_type='weekly_report' and period_start='2026-09-07';")
chk "0031 tidy-up leaves one report for the week" "$N" "1"
KEPT=$($P -c "select title from public.reports where team_id='d0000000-0000-0000-0000-000000000002' and report_type='weekly_report' and period_start='2026-09-07';")
chk "and the survivor is the newest" "$KEPT" "newer duplicate"

# A second report for the SAME (team, kind, period) must be refused.
DUP=$($P -c "insert into public.reports (event_id, team_id, created_by, report_type, title, period_start, period_end)
  values (null,'d0000000-0000-0000-0000-000000000002','77777777-7777-7777-7777-777777777777','weekly_report','second of the week','2026-09-07','2026-09-13');" 2>&1 || true)
case "$DUP" in *reports_one_per_period*) GOT="refused";; *) GOT="allowed";; esac
chk "a second weekly report for the same week is refused" "$GOT" "refused"

# The week AFTER is a different period: allowed.
OK1=$($P -q -c "insert into public.reports (event_id, team_id, created_by, report_type, title, period_start, period_end)
  values (null,'d0000000-0000-0000-0000-000000000002','77777777-7777-7777-7777-777777777777','weekly_report','next week','2026-09-14','2026-09-20') returning 'ok';")
chk "the next week gets its own report" "$OK1" "ok"

# The month that CONTAINS the week is a different kind: allowed.
OK2=$($P -q -c "insert into public.reports (event_id, team_id, created_by, report_type, title, period_start, period_end)
  values (null,'d0000000-0000-0000-0000-000000000002','77777777-7777-7777-7777-777777777777','monthly_report','the month','2026-09-01','2026-09-30') returning 'ok';")
chk "the month around it is its own report" "$OK2" "ok"

# Session reports are not rationed: two for the same event still insert.
OK3=$($P -q -c "
insert into public.events (id, user_id, team_id, club_id, event_type, title, event_date)
  values ('e0000000-0000-0000-0000-000000000009','77777777-7777-7777-7777-777777777777','d0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001','training_session','Tuesday','2026-09-08');
insert into public.reports (event_id, team_id, created_by, report_type, title) values
  ('e0000000-0000-0000-0000-000000000009','d0000000-0000-0000-0000-000000000002','77777777-7777-7777-7777-777777777777','training_report','session report'),
  ('e0000000-0000-0000-0000-000000000009','d0000000-0000-0000-0000-000000000002','77777777-7777-7777-7777-777777777777','training_report','session report again');
select count(*) from public.reports where event_id='e0000000-0000-0000-0000-000000000009';")
chk "session reports are outside the rule" "$OK3" "2"

sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$WORK/pgdata" -w stop >/dev/null 2>&1 || true
rm -rf "$WORK"
[ "$fail" = "0" ] && echo "ALL PASS" || { echo "FAILURES"; exit 1; }
