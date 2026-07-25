#!/usr/bin/env bash
# Runnable PG16 check for Tranche 3 schema/trigger changes (F9, F11).
# Applies bootstrap + all migrations, then asserts:
#   F9  - learn_insights_from_observation trigger is gone; inserting an
#         observation no longer flags an insights pass (voice still flagged).
#   F11 - reports.source_fingerprint column exists.
set -euo pipefail
WORK="/var/tmp/rlpg_t3"; SOCK="$WORK/sock"
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

fail=0
chk() { if [ "$2" = "$3" ]; then echo "PASS: $1"; else echo "FAIL: $1 (got '$2', want '$3')"; fail=1; fi; }

TRIG=$($P -c "select count(*) from pg_trigger where tgname='learn_insights_from_observation';")
chk "F9 insights trigger dropped" "$TRIG" "0"

VOICE_TRIG=$($P -c "select count(*) from pg_trigger where tgname='learn_voice_from_observation';")
chk "F9 voice trigger preserved" "$VOICE_TRIG" "1"

COL=$($P -c "select count(*) from information_schema.columns where table_name='reports' and column_name='source_fingerprint';")
chk "F11 reports.source_fingerprint exists" "$COL" "1"

INSIGHTS_TABLE=$($P -c "select count(*) from information_schema.tables where table_name='insights';")
chk "F9 insights table preserved" "$INSIGHTS_TABLE" "1"

# Behaviour: insert an observation, confirm insights NOT flagged but voice IS.
$P -c "insert into auth.users (id,email,raw_user_meta_data) values ('44444444-4444-4444-4444-444444444444','t3@test','{\"role\":\"coach\"}');" >/dev/null
$P -c "insert into public.observations (user_id, raw_note) values ('44444444-4444-4444-4444-444444444444','lost the ball under press');" >/dev/null
INS=$($P -c "select coalesce((insights_pending_since is not null)::text,'f') from public.learning_state where user_id='44444444-4444-4444-4444-444444444444';")
VOC=$($P -c "select coalesce((voice_pending_since is not null)::text,'f') from public.learning_state where user_id='44444444-4444-4444-4444-444444444444';")
chk "F9 observation does NOT flag insights" "$INS" "false"
chk "F9 observation still flags voice" "$VOC" "true"

sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$WORK/pgdata" -w stop >/dev/null 2>&1 || true
rm -rf "$WORK"
[ "$fail" = "0" ] && echo "ALL PASS" || { echo "FAILURES"; exit 1; }
