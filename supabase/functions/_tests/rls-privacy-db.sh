#!/usr/bin/env bash
# Runnable PG16 check that reflections, reports, observations and events are
# private to their owner at the ROW level (not just the UI). Runs as the
# `authenticated` role with auth.uid() driven by the test.uid GUC, so the RLS
# policies actually apply. Proves coach B cannot read coach A's data, and that
# the removed report_access sharing path (0015) no longer grants access.
set -euo pipefail
WORK="/var/tmp/rlpg_rls"; SOCK="$WORK/sock"
BOOT="${BOOT:-$(dirname "$0")/bootstrap.sql}"
rm -rf "$WORK"; mkdir -p "$WORK/sock"
cp "$BOOT" "$WORK/bootstrap.sql"
cat >> "$WORK/bootstrap.sql" <<'SQL'
alter table auth.users add column if not exists phone text;
alter table auth.users add column if not exists raw_user_meta_data jsonb default '{}'::jsonb;
-- authenticated must be able to reach the tables for RLS to be what restricts it.
SQL
cp "$(dirname "$0")"/../../migrations/*.sql "$WORK/"
chown -R postgres:postgres "$WORK"
sudo -u postgres /usr/lib/postgresql/16/bin/initdb -D "$WORK/pgdata" -U postgres >/dev/null 2>&1
sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$WORK/pgdata" \
  -o "-k $SOCK -p 5433 -c listen_addresses=''" -l "$WORK/pg.log" -w start >/dev/null 2>&1
P="sudo -u postgres /usr/lib/postgresql/16/bin/psql -h $SOCK -p 5433 -U postgres -d postgres -v ON_ERROR_STOP=1 -X -tA"
$P -f "$WORK/bootstrap.sql" >/dev/null
for f in "$WORK"/0*.sql; do $P -f "$f" >/dev/null; done

A='aaaaaaaa-0000-0000-0000-000000000001'
B='bbbbbbbb-0000-0000-0000-000000000002'
EV='eeee0000-0000-0000-0000-000000000001'
RF='ffff0000-0000-0000-0000-000000000001'
OB='0b0b0000-0000-0000-0000-000000000001'
RP='ac000000-0000-0000-0000-000000000001'

# Seed as superuser (bypasses RLS): two coaches, and a full set of A's data.
$P >/dev/null <<SQL
insert into auth.users (id,email,raw_user_meta_data) values
  ('$A','a@test','{"role":"coach"}'), ('$B','b@test','{"role":"coach"}');
insert into public.events (id,user_id,event_type,title,event_date)
  values ('$EV','$A','training_session','A session','2026-07-20');
insert into public.reflections (id,event_id,user_id,reflection_type,summary)
  values ('$RF','$EV','$A','coach','my private reflection');
insert into public.observations (id,event_id,user_id,raw_note)
  values ('$OB','$EV','$A','a private note');
insert into public.reports (id,event_id,created_by,report_type,title)
  values ('$RP','$EV','$A','training_report','A report');
-- Even with an explicit sharing grant to B, B must NOT be able to read it (0015).
insert into public.report_access (report_id,user_id,granted_by) values ('$RP','$B','$A');
SQL

fail=0
chk() { if [ "$2" = "$3" ]; then echo "PASS: $1"; else echo "FAIL: $1 (got '$2', want '$3')"; fail=1; fi; }

# Count rows visible to a given uid under RLS (role authenticated). The GUC and
# role must be set in the same transaction as the query; grep isolates the count
# line (pure digits) from the BEGIN/SET/uid/COMMIT transaction echo.
vis() { # $1=uid $2=table $3=id
  $P <<SQL | grep -E '^[0-9]+$' | tail -1
begin;
set local role authenticated;
select set_config('test.uid','$1',true);
select count(*) from public.$2 where id='$3';
commit;
SQL
}

chk "owner A sees own event"        "$(vis "$A" events "$EV")"       "1"
chk "coach B cannot see A event"    "$(vis "$B" events "$EV")"       "0"
chk "owner A sees own reflection"   "$(vis "$A" reflections "$RF")"  "1"
chk "coach B cannot see A reflection" "$(vis "$B" reflections "$RF")" "0"
chk "owner A sees own observation"  "$(vis "$A" observations "$OB")" "1"
chk "coach B cannot see A observation" "$(vis "$B" observations "$OB")" "0"
chk "owner A sees own report"       "$(vis "$A" reports "$RP")"      "1"
chk "coach B cannot see A report (sharing path closed)" "$(vis "$B" reports "$RP")" "0"

sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$WORK/pgdata" -w stop >/dev/null 2>&1 || true
rm -rf "$WORK"
[ "$fail" = "0" ] && echo "ALL PASS" || { echo "FAILURES"; exit 1; }
