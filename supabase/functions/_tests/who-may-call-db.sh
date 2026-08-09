#!/usr/bin/env bash
# Runnable PG16 check for 0027 (who may call what).
#
# Postgres grants EXECUTE on a new function to PUBLIC, and Supabase publishes
# everything in `public` at /rest/v1/rpc/<name> behind an anon key that ships in
# the frontend. So the default is: anyone on the internet can call it.
#
# Two functions from 0005 were genuinely reachable, and this file exists to keep
# them shut:
#
#   learning_due()          listed the user ids of the whole user base
#   clear_learning_pending() let any signed-in coach write to another coach's row
#
# The other half of the job is proving the fix did not take the app off the air.
# Six of these functions are named inside RLS policies, and a policy is evaluated
# as the querying role, so an over-enthusiastic revoke turns every read into
# "permission denied for function". The positive checks below are not padding.
set -euo pipefail
WORK="/var/tmp/rlpg_whomay"; SOCK="$WORK/sock"
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

OWNER='00000000-0000-0000-0000-0000000000aa'   # admin
COACH='00000000-0000-0000-0000-0000000000bb'   # an ordinary signed-in coach
VICTIM='00000000-0000-0000-0000-0000000000cc'  # someone else entirely

$P >/dev/null <<SQL
insert into auth.users (id,email,raw_user_meta_data) values
  ('$OWNER','owner@test','{"role":"coach"}'),
  ('$COACH','coach@test','{"role":"coach"}'),
  ('$VICTIM','victim@test','{"role":"coach"}');
insert into public.user_roles (user_id, role) values ('$OWNER','admin');
insert into public.learning_state (user_id, voice_pending_since)
  values ('$VICTIM', now());
SQL

pass=0; fail=0
ok(){ if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  ok  $1"; else fail=$((fail+1)); echo "  FAIL $1 (want '$3', got '$2')"; fi; }

# Prints ok / blocked, as whichever role, with auth.uid() set.
try() { # $1=role $2=uid $3=sql
  if $P >/dev/null 2>&1 <<SQL
begin;
set local role $1;
select set_config('test.uid','$2',true);
$3
commit;
SQL
  then echo "ok"; else echo "blocked"; fi
}

echo "0027: who may call what"

# --- the enumeration hole ----------------------------------------------------
# The anon key is in the frontend bundle, so "anon" here means anyone at all.
ok "a stranger cannot list the user base" \
  "$(try anon '' "select * from public.learning_due(500);")" "blocked"
ok "nor can a signed-in coach" \
  "$(try authenticated "$COACH" "select * from public.learning_due(500);")" "blocked"
ok "the sweep still can" \
  "$(try service_role '' "select * from public.learning_due(500);")" "ok"

# --- the write hole ----------------------------------------------------------
# This is the one that mattered: any coach could reach into any other coach's
# learning_state, and stop the sweep ever picking their new work up again.
ok "a coach cannot clear someone else's pending work" \
  "$(try authenticated "$COACH" "select public.clear_learning_pending('$VICTIM','voice');")" "blocked"
ok "nor can a stranger" \
  "$(try anon '' "select public.clear_learning_pending('$VICTIM','voice');")" "blocked"
ok "and not even an admin, because this was never theirs to call" \
  "$(try authenticated "$OWNER" "select public.clear_learning_pending('$VICTIM','voice');")" "blocked"
# Checked BEFORE the service role runs, or the legitimate call clears the mark
# and the assertion passes for the wrong reason. Three refusals that left the
# row alone is what "blocked" has to mean.
ok "so the victim's pending mark survived all three" \
  "$($P -c "select voice_pending_since is null from public.learning_state where user_id='$VICTIM'")" "f"
ok "the sweep still can" \
  "$(try service_role '' "select public.clear_learning_pending('$VICTIM','voice');")" "ok"
# And the other half: a revoke that had quietly broken the function would look
# identical from the outside until the sweep stopped working.
ok "and clearing it actually cleared it" \
  "$($P -c "select voice_pending_since is null from public.learning_state where user_id='$VICTIM'")" "t"

# --- the cost guard ----------------------------------------------------------
ok "is_over_budget is for the service role only" \
  "$(try authenticated "$COACH" "select public.is_over_budget('$VICTIM');")" "blocked"
ok "and the edge functions still have it" \
  "$(try service_role '' "select public.is_over_budget('$VICTIM');")" "ok"

# --- trigger functions are not endpoints -------------------------------------
ok "set_updated_at is not callable" \
  "$(try authenticated "$COACH" "select public.set_updated_at();")" "blocked"
ok "handle_new_user is not callable" \
  "$(try anon '' "select public.handle_new_user();")" "blocked"
ok "track_usage is not callable" \
  "$(try authenticated "$COACH" "select public.track_usage();")" "blocked"
ok "profiles_block_admin_role is not callable" \
  "$(try authenticated "$COACH" "select public.profiles_block_admin_role();")" "blocked"

# --- ...and the triggers still fire ------------------------------------------
# The point of the revoke is that it changes nothing here. Postgres checks
# EXECUTE when a trigger is created, not each time it runs.
$P >/dev/null <<SQL
insert into auth.users (id,email,raw_user_meta_data)
  values ('00000000-0000-0000-0000-0000000000dd','fresh@test','{"role":"coach"}');
SQL
ok "handle_new_user still made a profile for a new sign-up" \
  "$($P -c "select count(*) from public.profiles where email='fresh@test'")" "1"
ok "and set_updated_at still stamps an update" \
  "$(try authenticated "$COACH" "update public.profiles set full_name='Changed' where id='$COACH';")" "ok"
ok "with a timestamp that actually moved" \
  "$($P -c "select updated_at > created_at from public.profiles where id='$COACH'")" "t"
ok "and 0016's trigger still refuses a self-granted admin" \
  "$(try authenticated "$COACH" "update public.profiles set role='admin' where id='$COACH';")" "blocked"

# --- what the app calls still works ------------------------------------------
# Revoking from PUBLIC takes it from everyone who only held it through PUBLIC,
# so each of these needed granting back by name. A miss here is an outage.
ok "the app can still ask whether you are admin" \
  "$(try authenticated "$COACH" "select public.is_admin();")" "ok"
ok "and start the free month" \
  "$(try authenticated "$COACH" "select public.start_trial('coach');")" "ok"
ok "and count the days left" \
  "$(try authenticated "$COACH" "select public.trial_days_left('$COACH');")" "ok"
ok "and schedule a deletion" \
  "$(try authenticated "$COACH" "select public.request_account_deletion();")" "ok"
ok "and undo it" \
  "$(try authenticated "$COACH" "select public.cancel_account_deletion();")" "ok"
ok "the Owner dashboard can still grant" \
  "$(try authenticated "$OWNER" "select public.grant_plan('coach@test','coach_beta',90);")" "ok"
ok "and revoke" \
  "$(try authenticated "$OWNER" "select public.revoke_plan('coach@test','coach_beta');")" "ok"
ok "and a coach still cannot grant themselves anything" \
  "$(try authenticated "$COACH" "select public.grant_plan('coach@test','coach_comp',null);")" "blocked"

# --- the policy helpers, deliberately left callable --------------------------
# Named inside RLS policies, which are evaluated as the querying role. Revoking
# these would not harden anything, it would refuse every read that touches them.
ok "reading a session still works" \
  "$(try authenticated "$COACH" "select count(*) from public.events;")" "ok"
ok "reading notes still works" \
  "$(try authenticated "$COACH" "select count(*) from public.observations;")" "ok"
ok "reading reports still works" \
  "$(try authenticated "$COACH" "select count(*) from public.reports;")" "ok"
ok "and the plan catalogue still reads for a signed-out visitor" \
  "$(try anon '' "select count(*) from public.plans;")" "ok"

# --- landing_events: recordable, not forgeable -------------------------------
ok "a stranger may still record a landing" \
  "$(try anon '' "insert into public.landing_events (visitor_id, event, path) values ('v1','view','/');")" "ok"
ok "but not pin it on somebody's account" \
  "$(try anon '' "insert into public.landing_events (visitor_id, event, user_id) values ('v1','view','$VICTIM');")" "blocked"
ok "a signed-in coach may record as themselves" \
  "$(try authenticated "$COACH" "insert into public.landing_events (visitor_id, event, user_id) values ('v2','view','$COACH');")" "ok"
ok "and still not as anyone else" \
  "$(try authenticated "$COACH" "insert into public.landing_events (visitor_id, event, user_id) values ('v2','view','$VICTIM');")" "blocked"
ok "an unbounded referrer is refused" \
  "$(try anon '' "insert into public.landing_events (visitor_id, event, referrer) values ('v1','view', repeat('x', 5000));")" "blocked"
ok "and the admin can still read the lot" \
  "$(try authenticated "$OWNER" "select count(*) from public.landing_events;")" "ok"

# --- the search_path loose end -----------------------------------------------
ok "set_updated_at has a fixed search_path" \
  "$($P -c "select 'search_path=public' = any(proconfig) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_updated_at'")" "t"

sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$WORK/pgdata" -m immediate stop >/dev/null 2>&1 || true
echo
if [ "$fail" -eq 0 ]; then echo "ALL PASS ($pass checks)"; else echo "$pass passed, $fail FAILED"; exit 1; fi
