#!/usr/bin/env bash
# Runnable PG16 check for 0026 (activity beside the account).
#
# The beta is handed out to the coaches who actually use the app, which means
# the Owner dashboard has to be able to tell who those are. Two things have to
# be true at once, and they pull against each other:
#
#   1. The owner can see HOW MUCH each coach has written and WHEN they last did.
#      A plain column in the view could not: 0025 made every view run as its
#      caller, and events/observations/reflections/reports are owner-only, so
#      the counts would come back zero for everyone else. Silently. It would
#      look like nobody was using the app.
#   2. The owner still cannot read a WORD of it. A coach's notes about their
#      under-12s are the thing the privacy notice promises, and "count without
#      reading" is only worth anything if the reading half stays shut.
#
# So the negative checks below are the point of this file, not the positives.
set -euo pipefail
WORK="/var/tmp/rlpg_activity"; SOCK="$WORK/sock"
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
  -o "-k $SOCK -p 5433 -c listen_addresses=''" -l "$WORK/pg.log" -w start >/dev/null 2>&1
P="sudo -u postgres /usr/lib/postgresql/16/bin/psql -h $SOCK -p 5433 -U postgres -d postgres -v ON_ERROR_STOP=1 -X -tA"
$P -f "$WORK/bootstrap.sql" >/dev/null
for f in "$WORK"/0*.sql; do $P -f "$f" >/dev/null; done

OWNER='00000000-0000-0000-0000-0000000000aa'   # you: admin
KEEN='00000000-0000-0000-0000-0000000000bb'    # a tester who is using it
QUIET='00000000-0000-0000-0000-0000000000cc'   # a tester who signed up and stopped

$P >/dev/null <<SQL
insert into auth.users (id,email,raw_user_meta_data) values
  ('$OWNER','owner@test','{"role":"coach"}'),
  ('$KEEN','keen@test','{"role":"coach"}'),
  ('$QUIET','quiet@test','{"role":"coach"}');
insert into public.user_roles (user_id, role) values ('$OWNER','admin');

-- The keen one: three sessions, four notes, two reflections, one report. No
-- club or team, because events.team_id is nullable and the counting does not
-- care: fewer schema details to get wrong here means fewer false alarms later.
insert into public.events (id, user_id, event_type, title, created_at) values
  ('33333333-3333-3333-3333-333333333331','$KEEN','training_session','Session one', now() - interval '9 days'),
  ('33333333-3333-3333-3333-333333333332','$KEEN','training_session','Session two', now() - interval '5 days'),
  ('33333333-3333-3333-3333-333333333333','$KEEN','match',           'The game',    now() - interval '2 days');
insert into public.observations (user_id, event_id, raw_note, created_at) values
  ('$KEEN','33333333-3333-3333-3333-333333333331','Keeper played out calmly',   now() - interval '9 days'),
  ('$KEEN','33333333-3333-3333-3333-333333333332','Midfield too flat',          now() - interval '5 days'),
  ('$KEEN','33333333-3333-3333-3333-333333333333','Game changer lifted us',     now() - interval '2 days'),
  ('$KEEN', null,                                  'Thought on the drive home', now() - interval '1 day');
insert into public.reflections (user_id, event_id, reflection_type, summary, created_at) values
  ('$KEEN','33333333-3333-3333-3333-333333333331','coach','I talked too much', now() - interval '9 days'),
  ('$KEEN','33333333-3333-3333-3333-333333333333','coach','Quieter, better',   now() - interval '2 days');
insert into public.reports (created_by, event_id, report_type, title) values
  ('$KEEN','33333333-3333-3333-3333-333333333333','match_report','The game');
SQL

pass=0; fail=0
ok(){ if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  ok  $1"; else fail=$((fail+1)); echo "  FAIL $1 (want '$3', got '$2')"; fi; }

asu() { # $1=uid $2=sql — run as `authenticated` with auth.uid() set
  { $P <<SQL 2>/dev/null | grep -vE '^(BEGIN|COMMIT|ROLLBACK|SET|[0-9a-f-]{36})$' | grep -v '^$' | tail -1
begin;
set local role authenticated;
select set_config('test.uid','$1',true);
$2
commit;
SQL
  } || true
}

echo "0026: who is actually using it"

# --- the owner can see activity, for other people ----------------------------
# The whole point. Under invoker rules a naive join would have counted only the
# admin's own rows and reported zero for everyone else, which reads as "nobody
# is using it" rather than as a bug.
ok "the owner sees the keen tester's sessions" \
  "$(asu "$OWNER" "select sessions from public.admin_accounts where email='keen@test';")" "3"
ok "and their notes, including the one filed against no session" \
  "$(asu "$OWNER" "select notes from public.admin_accounts where email='keen@test';")" "4"
ok "and their reflections" \
  "$(asu "$OWNER" "select reflections from public.admin_accounts where email='keen@test';")" "2"
ok "and their reports" \
  "$(asu "$OWNER" "select reports from public.admin_accounts where email='keen@test';")" "1"

# A tester who signed up and never came back is the case the whole feature is
# for, so it has to read as zero rather than as null or a missing row.
ok "the quiet one is listed, not omitted" \
  "$(asu "$OWNER" "select count(*) from public.admin_accounts where email='quiet@test';")" "1"
ok "and reads as zero, not null" \
  "$(asu "$OWNER" "select sessions||'/'||notes||'/'||reflections||'/'||reports from public.admin_accounts where email='quiet@test';")" "0/0/0/0"
ok "with no last-active date at all" \
  "$(asu "$OWNER" "select coalesce(last_active::text,'never') from public.admin_accounts where email='quiet@test';")" "never"

# last_active is the column the decision actually gets made on, so it has to be
# the newest thing they did across all three, not just the newest session.
ok "last active follows the most recent thing they wrote" \
  "$(asu "$OWNER" "select date_trunc('day',last_active) = date_trunc('day', now() - interval '1 day') from public.admin_accounts where email='keen@test';")" "t"

# --- and still cannot read any of it -----------------------------------------
# The negative half. Counting is allowed BECAUSE reading is not, so if these
# ever flip, the trade this migration made has been quietly cancelled.
ok "the owner cannot read another coach's notes" \
  "$(asu "$OWNER" "select count(*) from public.observations;")" "0"
ok "nor their sessions" \
  "$(asu "$OWNER" "select count(*) from public.events;")" "0"
ok "nor their reflections" \
  "$(asu "$OWNER" "select count(*) from public.reflections;")" "0"
ok "nor their reports" \
  "$(asu "$OWNER" "select count(*) from public.reports;")" "0"
# The coach themselves is unaffected: this changed nothing about their access.
ok "the coach still reads their own notes" \
  "$(asu "$KEEN" "select count(*) from public.observations;")" "4"

# --- a non-admin learns nothing ----------------------------------------------
# Quietly, with zero rows rather than an error: admin_accounts is selectable by
# anyone signed in and answers a non-admin with nothing. A function that raised
# would turn that into a stack trace on the dashboard of whoever hit it.
ok "a coach gets nothing from admin_accounts" \
  "$(asu "$KEEN" "select count(*) from public.admin_accounts;")" "0"
ok "and nothing from admin_activity, without an error" \
  "$(asu "$KEEN" "select count(*) from public.admin_activity();")" "0"
ok "not even about themselves" \
  "$(asu "$KEEN" "select count(*) from public.admin_activity() where user_id='$KEEN';")" "0"

# --- 0025 is still standing --------------------------------------------------
# create or replace view rewrites the view's options. Losing this would put the
# view back to running as its owner, silently, and undo the migration before it.
ok "admin_accounts still runs as its caller" \
  "$($P -c "select 'security_invoker=true' = any(reloptions) from pg_class where relname='admin_accounts'")" "t"
ok "and the is_admin gate is still in the body" \
  "$($P -c "select pg_get_viewdef('public.admin_accounts'::regclass) like '%is_admin()%'")" "t"

# --- the old columns are untouched -------------------------------------------
# Everything reading the first eleven has to keep working, so the additions go
# on the end.
ok "the account columns still come first" \
  "$($P -c "select string_agg(attname,',' order by attnum) from pg_attribute where attrelid='public.admin_accounts'::regclass and attnum between 1 and 11")" \
  "user_id,email,full_name,joined_at,plan_id,plan_name,kind,status,trial_ends_at,usable,days_left"

sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$WORK/pgdata" -m immediate stop >/dev/null 2>&1 || true
echo
if [ "$fail" -eq 0 ]; then echo "ALL PASS ($pass checks)"; else echo "$pass passed, $fail FAILED"; exit 1; fi
