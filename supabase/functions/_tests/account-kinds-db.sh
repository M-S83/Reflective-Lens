#!/usr/bin/env bash
# Runnable PG16 check for 0022 (beta, comped and paid accounts).
#
# Three claims worth proving on a real database rather than by reading:
#
#   1. A plan with is_active = false still grants access. The two new plans are
#      off the catalogue so they cannot be bought, and access is decided by
#      active_roles(), which does not read is_active. That is a coupling between
#      two files written months apart, and exactly the kind a later edit breaks
#      without noticing.
#   2. grant_plan and revoke_plan are admin-only, called as `authenticated` with
#      auth.uid() driven by the test.uid GUC, so the check is the real one.
#   3. A granted plan leaves ONE clock running. The free month starts itself on
#      first sign-in, so everyone you grant to already has a trial ticking.
set -euo pipefail
WORK="/var/tmp/rlpg_kinds"; SOCK="$WORK/sock"
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
BETA='00000000-0000-0000-0000-0000000000bb'    # a beta tester
COMP='00000000-0000-0000-0000-0000000000cc'    # a coach given the app
PAID='00000000-0000-0000-0000-0000000000dd'    # a paying coach
SNEAK='00000000-0000-0000-0000-0000000000ee'   # an ordinary user trying it on

$P >/dev/null <<SQL
insert into auth.users (id,email,raw_user_meta_data) values
  ('$OWNER','owner@test','{"role":"coach"}'),
  ('$BETA','beta@test','{"role":"coach"}'),
  ('$COMP','comp@test','{"role":"coach"}'),
  ('$PAID','paid@test','{"role":"coach"}'),
  ('$SNEAK','sneak@test','{"role":"coach"}');
insert into public.user_roles (user_id, role) values ('$OWNER','admin');
SQL

pass=0; fail=0
ok(){ if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  ok  $1"; else fail=$((fail+1)); echo "  FAIL $1 (want '$3', got '$2')"; fi; }

# Run SQL as `authenticated` with auth.uid() set, returning the last plain value.
# Same shape as roles-glossary-db.sh: psql echoes a command tag for every
# statement, so the SETs and the set_config uuid are filtered out.
#
# The `|| true` matters under `set -euo pipefail`: grep exits 1 when it prints
# nothing, which is the normal outcome for a function returning void, and that
# would abort the whole run without a word about why.
asu() { # $1=uid $2=sql
  { $P <<SQL 2>/dev/null | grep -vE '^(BEGIN|COMMIT|ROLLBACK|SET|[0-9a-f-]{36})$' | grep -v '^$' | tail -1
begin;
set local role authenticated;
select set_config('test.uid','$1',true);
$2
commit;
SQL
  } || true
}

# Same, but we only care whether it was refused. Prints ok / blocked.
try() { # $1=uid $2=sql
  if $P >/dev/null 2>&1 <<SQL
begin;
set local role authenticated;
select set_config('test.uid','$1',true);
$2
commit;
SQL
  then echo "ok"; else echo "blocked"; fi
}

# has_role has two overloads with opposite argument orders: (text, uuid) from
# 0008 and (uuid, user_role) from 0016. Two unknown literals match both, so the
# call has to say which it means.
coach_ok() { $P -c "select public.has_role('coach'::text, '$1'::uuid)"; }

echo "0022: beta, comped and paid accounts"

# --- the plans exist and are off the catalogue -------------------------------
ok "beta plan exists"  "$($P -c "select count(*) from public.plans where id='coach_beta'")" "1"
ok "comp plan exists"  "$($P -c "select count(*) from public.plans where id='coach_comp'")" "1"
ok "neither is purchasable" \
  "$($P -c "select count(*) from public.plans where id in ('coach_beta','coach_comp') and is_active")" "0"
ok "both are free, so neither shows as revenue" \
  "$($P -c "select count(*) from public.plans where id in ('coach_beta','coach_comp') and price_pence<>0")" "0"
ok "each is tagged with its kind" \
  "$($P -c "select count(*) from public.plans where (features->>'kind') in ('beta','comp')")" "2"

# --- only an admin may grant -------------------------------------------------
ok "an ordinary user cannot grant themselves a plan" \
  "$(try "$SNEAK" "select public.grant_plan('sneak@test','coach_comp',null);")" "blocked"
ok "and cannot grant anyone else one either" \
  "$(try "$SNEAK" "select public.grant_plan('beta@test','coach_comp',null);")" "blocked"
ok "nor revoke" \
  "$(try "$SNEAK" "select public.revoke_plan('beta@test','coach_comp');")" "blocked"
ok "so no subscription appeared" \
  "$($P -c "select count(*) from public.subscriptions where user_id='$SNEAK'")" "0"

# --- beta: usable, and on a timer -------------------------------------------
# Granted the way it will really be granted: by the owner, over the wire.
asu "$OWNER" "select public.grant_plan('beta@test','coach_beta',60);" >/dev/null
ok "beta access is usable" \
  "$(coach_ok "$BETA")" "t"
ok "it is a trial, so it ends by itself" \
  "$($P -c "select status from public.subscriptions where user_id='$BETA' and plan_id='coach_beta'")" "trialing"
ok "the timer is the length asked for" \
  "$($P -c "select round(extract(epoch from (trial_ends_at-now()))/86400)::int from public.subscriptions where user_id='$BETA' and plan_id='coach_beta'")" "60"
ok "trial_days_left agrees" "$($P -c "select public.trial_days_left('$BETA')")" "60"

# THE ONE THAT MATTERS: is_active=false must not cost them access.
ok "an off-catalogue plan still grants access" \
  "$($P -c "select 'coach' = any(public.active_roles('$BETA'))")" "t"

# Expiry is real, not decorative.
$P -c "update public.subscriptions set trial_ends_at = now() - interval '1 day' where user_id='$BETA'" >/dev/null
ok "when the timer runs out, access stops" "$(coach_ok "$BETA")" "f"
ok "and they are read-only, not erased" \
  "$($P -c "select count(*) from public.subscriptions where user_id='$BETA'")" "1"
$P -c "update public.subscriptions set trial_ends_at = now() + interval '60 days' where user_id='$BETA'" >/dev/null

# --- comp: usable, and never lapses -----------------------------------------
asu "$OWNER" "select public.grant_plan('comp@test','coach_comp',null);" >/dev/null
ok "comped access is usable" "$(coach_ok "$COMP")" "t"
ok "it is active, not a trial" \
  "$($P -c "select status from public.subscriptions where user_id='$COMP' and plan_id='coach_comp'")" "active"
ok "it has no end date" \
  "$($P -c "select trial_ends_at is null from public.subscriptions where user_id='$COMP' and plan_id='coach_comp'")" "t"
ok "so nothing counts down at them" "$($P -c "select public.trial_days_left('$COMP')")" "0"
ok "and it adds nothing to MRR" \
  "$(asu "$OWNER" "select active_subscriptions from public.analytics_mrr;")" "1"

# --- one clock ---------------------------------------------------------------
# The realistic order of events: a tester signs up, the app starts their free
# month by itself, and only then do you grant them beta.
asu "$PAID" "select public.start_trial('coach');" >/dev/null
ok "the self-serve month started" \
  "$($P -c "select status from public.subscriptions where user_id='$PAID' and plan_id='coach_monthly'")" "trialing"
asu "$OWNER" "select public.grant_plan('paid@test','coach_beta',90);" >/dev/null
ok "granting beta retires the free month" \
  "$($P -c "select status from public.subscriptions where user_id='$PAID' and plan_id='coach_monthly'")" "canceled"
ok "leaving exactly one clock running" \
  "$($P -c "select count(*) from public.subscriptions where user_id='$PAID' and status='trialing'")" "1"
ok "and it is the granted one" "$($P -c "select public.trial_days_left('$PAID')")" "90"

# --- re-granting extends rather than failing --------------------------------
asu "$OWNER" "select public.grant_plan('paid@test','coach_beta',120);" >/dev/null
ok "a second grant extends the same row" \
  "$($P -c "select count(*) from public.subscriptions where user_id='$PAID' and plan_id='coach_beta'")" "1"
ok "to the new date" "$($P -c "select public.trial_days_left('$PAID')")" "120"

# --- revoke ------------------------------------------------------------------
asu "$OWNER" "select public.revoke_plan('comp@test','coach_comp');" >/dev/null
ok "revoking ends access" "$(coach_ok "$COMP")" "f"
ok "the row stays, so no fresh free month" \
  "$($P -c "select count(*) from public.subscriptions where user_id='$COMP' and plan_id='coach_comp'")" "1"
ok "an unknown email is refused clearly" \
  "$(try "$OWNER" "select public.grant_plan('nobody@test','coach_comp',null);")" "blocked"
ok "an unknown plan is refused clearly" \
  "$(try "$OWNER" "select public.grant_plan('comp@test','coach_platinum',null);")" "blocked"
ok "a withdrawn player plan cannot be granted" \
  "$(try "$OWNER" "select public.grant_plan('comp@test','player_monthly',null);")" "blocked"

# --- THE PATH THE APP ACTUALLY USES -----------------------------------------
# active_roles() is SECURITY DEFINER and runs past RLS, so proving it works
# proves nothing about the client, which reads the tables directly:
#
#   .from("subscriptions").select("status, trial_ends_at, plan:plans(name, features)")
#
# 0022 made the granted plans is_active = false so they could not be bought, and
# the 0004 catalogue policy (is_active or is_admin) then hid them from the people
# on them. The embedded plan came back null, so no features, so no role, so the
# subscription was skipped and every beta coach landed in a read-only app on the
# day they were invited. 0023 is the fix; these are the assertions that would
# have caught it.
ok "a beta coach can read the plan they are on" \
  "$(asu "$BETA" "select p.name from public.subscriptions s join public.plans p on p.id = s.plan_id where s.plan_id = 'coach_beta';")" "Beta"
ok "and its features, which is where the role lives" \
  "$(asu "$BETA" "select p.features->>'role' from public.subscriptions s join public.plans p on p.id = s.plan_id where s.plan_id = 'coach_beta';")" "coach"
ok "so the kind resolves too" \
  "$(asu "$BETA" "select p.features->>'kind' from public.subscriptions s join public.plans p on p.id = s.plan_id where s.plan_id = 'coach_beta';")" "beta"
# The catalogue rule still holds: not being able to BUY it is the point.
ok "but a granted plan is still off the catalogue for everyone else" \
  "$(asu "$SNEAK" "select count(*) from public.plans where id in ('coach_beta','coach_comp');")" "0"
ok "and a coach sees only the plan they hold, not both" \
  "$(asu "$BETA" "select count(*) from public.plans where id in ('coach_beta','coach_comp');")" "1"
ok "the buyable plans are still public" \
  "$(asu "$SNEAK" "select count(*) from public.plans where id = 'coach_monthly';")" "1"

# --- a case-pair is refused, not guessed at ----------------------------------
# SELECT INTO with two matching rows takes whichever the planner returns first
# and says nothing, so granting to a coach with a case-pair had even odds of
# landing on their empty account. They would be told they had access, sign in,
# and not have it.
$P >/dev/null <<SQL
insert into auth.users (id,email,raw_user_meta_data)
  values ('00000000-0000-0000-0000-0000000000ff','Beta@test','{"role":"coach"}');
SQL
ok "two accounts now differ only by capitals" \
  "$($P -c "select count(*) from public.profiles where lower(email)='beta@test'")" "2"
ok "granting refuses rather than picking one" \
  "$(try "$OWNER" "select public.grant_plan('beta@test','coach_comp',null);")" "blocked"
ok "and so does revoking" \
  "$(try "$OWNER" "select public.revoke_plan('beta@test','coach_beta');")" "blocked"
ok "the owner can see the pair" \
  "$(asu "$OWNER" "select accounts from public.admin_duplicate_emails where email='beta@test';")" "2"
ok "an ordinary user cannot" \
  "$(asu "$SNEAK" "select count(*) from public.admin_duplicate_emails;")" "0"
$P -c "delete from auth.users where id='00000000-0000-0000-0000-0000000000ff'" >/dev/null
ok "with the duplicate gone, granting works again" \
  "$(try "$OWNER" "select public.grant_plan('beta@test','coach_beta',60);")" "ok"
ok "and the list is empty" \
  "$(asu "$OWNER" "select count(*) from public.admin_duplicate_emails;")" "0"

# --- the dashboard view ------------------------------------------------------
ok "an ordinary user sees nobody" "$(asu "$SNEAK" "select count(*) from public.admin_accounts;")" "0"
ok "the owner sees every account" "$(asu "$OWNER" "select count(*) from public.admin_accounts;")" "5"
ok "and each is labelled by kind" \
  "$(asu "$OWNER" "select kind from public.admin_accounts where email='beta@test';")" "beta"
ok "a live grant reads as usable" \
  "$(asu "$OWNER" "select usable from public.admin_accounts where email='beta@test';")" "t"
ok "a revoked one does not" \
  "$(asu "$OWNER" "select usable from public.admin_accounts where email='comp@test';")" "f"
ok "someone who never signed in shows no plan" \
  "$(asu "$OWNER" "select coalesce(plan_id,'none') from public.admin_accounts where email='owner@test';")" "none"

sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$WORK/pgdata" -m immediate stop >/dev/null 2>&1 || true
echo
if [ "$fail" -eq 0 ]; then echo "ALL PASS ($pass checks)"; else echo "$pass passed, $fail FAILED"; exit 1; fi
