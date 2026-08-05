#!/usr/bin/env bash
# Runnable PG16 check for 0016 (privilege roles) and 0017 (glossary, analytics,
# trial). Runs as the `authenticated` role with auth.uid() driven by the test.uid
# GUC, so the RLS policies and the role trigger actually apply.
#
# The headline assertion is the escalation itself: before 0016, any signed-in
# user could `update profiles set role='admin' where id = auth.uid()` and gain
# is_admin(). This proves that path is shut, that user_roles cannot be written
# from the client either, and that is_admin() now follows user_roles.
set -euo pipefail
WORK="/var/tmp/rlpg_roles"; SOCK="$WORK/sock"
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
# Applying every migration in order is itself the first assertion: 0016 and 0017
# have to sit on top of 0001-0015 without a conflict.
for f in "$WORK"/0*.sql; do $P -f "$f" >/dev/null; done

A='aaaaaaaa-0000-0000-0000-000000000001'   # ordinary coach, the attacker
B='bbbbbbbb-0000-0000-0000-000000000002'   # a real admin
C='cccccccc-0000-0000-0000-000000000003'   # another coach, for privacy checks

$P >/dev/null <<SQL
insert into auth.users (id,email,raw_user_meta_data) values
  ('$A','a@test','{"role":"coach"}'),
  ('$B','b@test','{"role":"coach"}'),
  ('$C','c@test','{"role":"coach"}');
-- B is an admin the supported way.
insert into public.user_roles (user_id, role) values ('$B','admin');
-- A's own glossary term and a feature event, to check they stay private.
insert into public.coach_glossary (user_id,term,meaning)
  values ('$A','the pocket','the space between their midfield and back line');
insert into public.feature_events (user_id,feature) values ('$A','generate_report');
SQL

fail=0
chk() { if [ "$2" = "$3" ]; then echo "PASS: $1"; else echo "FAIL: $1 (got '$2', want '$3')"; fail=1; fi; }

# Run SQL as `authenticated` with auth.uid() set, returning the last plain value.
as_user() { # $1=uid $2=sql
  $P <<SQL 2>/dev/null | grep -vE '^(BEGIN|COMMIT|ROLLBACK|SET|[0-9a-f-]{36})$' | grep -v '^$' | tail -1
begin;
set local role authenticated;
select set_config('test.uid','$1',true);
$2
commit;
SQL
}

# Same, but we only care whether it errored. Prints ok / blocked.
try_as_user() { # $1=uid $2=sql
  if $P >/dev/null 2>&1 <<SQL
begin;
set local role authenticated;
select set_config('test.uid','$1',true);
$2
commit;
SQL
  then echo "ok"; else echo "blocked"; fi
}

# --- THE ESCALATION ----------------------------------------------------------
chk "coach cannot promote self via profiles.role" \
  "$(try_as_user "$A" "update public.profiles set role='admin' where id='$A';")" "blocked"
chk "coach cannot grant self admin in user_roles" \
  "$(try_as_user "$A" "insert into public.user_roles (user_id,role) values ('$A','admin');")" "blocked"
chk "coach is not admin after trying both" \
  "$(as_user "$A" "select public.is_admin();")" "f"
chk "real admin is admin" \
  "$(as_user "$B" "select public.is_admin();")" "t"
chk "profiles.role still says coach for A" \
  "$(as_user "$A" "select role from public.profiles where id='$A';")" "coach"

# A sign-up asking for admin in its metadata is coerced, not honoured.
$P >/dev/null <<SQL
insert into auth.users (id,email,raw_user_meta_data)
  values ('dddddddd-0000-0000-0000-000000000004','d@test','{"role":"admin"}');
SQL
chk "sign-up metadata cannot claim admin" \
  "$($P -c "select role from public.profiles where id='dddddddd-0000-0000-0000-000000000004';")" "coach"
chk "and that sign-up got no admin row" \
  "$($P -c "select count(*) from public.user_roles where user_id='dddddddd-0000-0000-0000-000000000004';")" "0"

# Demotion is still allowed, so the column can be tidied.
chk "demoting a profile role is still allowed" \
  "$(try_as_user "$A" "update public.profiles set role='player' where id='$A';")" "ok"

# --- GLOSSARY AND ANALYTICS PRIVACY -----------------------------------------
chk "coach reads own glossary term" \
  "$(as_user "$A" "select count(*) from public.coach_glossary where user_id='$A';")" "1"
chk "another coach cannot read it" \
  "$(as_user "$C" "select count(*) from public.coach_glossary where user_id='$A';")" "0"
chk "coach cannot write into another's glossary" \
  "$(try_as_user "$C" "insert into public.coach_glossary (user_id,term,meaning) values ('$A','x','y');")" "blocked"
chk "coach reads own feature events" \
  "$(as_user "$A" "select count(*) from public.feature_events where user_id='$A';")" "1"
chk "another coach cannot read them" \
  "$(as_user "$C" "select count(*) from public.feature_events where user_id='$A';")" "0"
chk "admin can read across feature events" \
  "$(as_user "$B" "select count(*) from public.feature_events;")" "1"

# email_deliveries is service-role only: not even readable by its own user.
chk "user cannot read email_deliveries" \
  "$(try_as_user "$A" "select count(*) from public.email_deliveries;")" "blocked"

# --- TRIAL -------------------------------------------------------------------
# Fresh sign-up: 30 days. Backdated 29 days: 1 left. Backdated 40: floored at 0.
chk "new account has 30 days of trial" \
  "$($P -c "select public.trial_days_left('$A');")" "30"
$P >/dev/null -c "update public.profiles set trial_started_at = now() - interval '29 days' where id='$A';"
chk "29 days in, 1 day left" \
  "$($P -c "select public.trial_days_left('$A');")" "1"
$P >/dev/null -c "update public.profiles set trial_started_at = now() - interval '40 days' where id='$A';"
chk "expired trial floors at 0, never negative" \
  "$($P -c "select public.trial_days_left('$A');")" "0"

# --- IDEMPOTENCY -------------------------------------------------------------
# The unique (user_id, kind) is what stops the sweep double-emailing.
$P >/dev/null -c "insert into public.email_deliveries (user_id,kind) values ('$A','trial_7_day');"
chk "a second identical send is rejected" \
  "$(if $P >/dev/null 2>&1 -c "insert into public.email_deliveries (user_id,kind) values ('$A','trial_7_day');"; then echo ok; else echo blocked; fi)" "blocked"
chk "but a different kind is allowed" \
  "$(if $P >/dev/null 2>&1 -c "insert into public.email_deliveries (user_id,kind) values ('$A','trial_1_day');"; then echo ok; else echo blocked; fi)" "ok"

sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$WORK/pgdata" -w stop >/dev/null 2>&1 || true
rm -rf "$WORK"
[ "$fail" = "0" ] && echo "ALL PASS" || { echo "FAILURES"; exit 1; }
