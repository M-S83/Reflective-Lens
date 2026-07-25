#!/usr/bin/env bash
# Runnable PG16 check for F5: event_attendance is the canonical squad store.
# Applies all migrations, seeds a squad via event_attendance, then runs the exact
# read shapes the edge functions now use and asserts they resolve and return the
# right rows:
#   - clean-observation attribution: shirt number -> player_id via
#     event_attendance JOIN players.
#   - generate-report roster: the squad for an event via event_attendance JOIN players.
set -euo pipefail
WORK="/var/tmp/rlpg_f5"; SOCK="$WORK/sock"
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

# Seed: coach, club, team, two players (#7, #9), a match event, and attendance.
$P >/dev/null <<'SQL'
insert into auth.users (id,email,raw_user_meta_data)
  values ('55555555-5555-5555-5555-555555555555','f5@test','{"role":"coach"}');
insert into public.clubs (id, name, created_by)
  values ('c0000000-0000-0000-0000-000000000001','Test FC','55555555-5555-5555-5555-555555555555');
insert into public.teams (id, club_id, name, age_group, format, created_by)
  values ('c0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','U12','U12','9v9','55555555-5555-5555-5555-555555555555');
insert into public.players (id, team_id, first_name, last_name, display_name, shirt_number, created_by) values
  ('c0000000-0000-0000-0000-000000000007','c0000000-0000-0000-0000-000000000002','Oscar','Smith','Oscar S',7,'55555555-5555-5555-5555-555555555555'),
  ('c0000000-0000-0000-0000-000000000009','c0000000-0000-0000-0000-000000000002','Leo','Brown','Leo B',9,'55555555-5555-5555-5555-555555555555');
insert into public.events (id, user_id, team_id, club_id, event_type, title, event_date)
  values ('e0000000-0000-0000-0000-000000000001','55555555-5555-5555-5555-555555555555','c0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','match','vs Rovers','2026-07-20');
insert into public.event_attendance (event_id, player_id, status, selection) values
  ('e0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000007','present','starter'),
  ('e0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000009','present','substitute');
SQL

# clean-observation attribution: shirt 9 in this event -> player #9.
ATTR=$($P -c "select a.player_id from public.event_attendance a join public.players p on p.id=a.player_id where a.event_id='e0000000-0000-0000-0000-000000000001' and p.shirt_number=9 limit 1;")
chk "F5 attribution: shirt 9 -> correct player" "$ATTR" "c0000000-0000-0000-0000-000000000009"

# A shirt not in the squad attributes to nobody.
NONE=$($P -c "select count(*) from public.event_attendance a join public.players p on p.id=a.player_id where a.event_id='e0000000-0000-0000-0000-000000000001' and p.shirt_number=99;")
chk "F5 attribution: unknown shirt -> no match" "$NONE" "0"

# generate-report roster: the squad for the event.
ROSTER=$($P -c "select count(*) from public.event_attendance a join public.players p on p.id=a.player_id where a.event_id='e0000000-0000-0000-0000-000000000001';")
chk "F5 roster: squad has both players" "$ROSTER" "2"

# Roster carries selection (starter/substitute) from event_attendance.
SEL=$($P -c "select a.selection from public.event_attendance a join public.players p on p.id=a.player_id where a.event_id='e0000000-0000-0000-0000-000000000001' and p.shirt_number=7;")
chk "F5 roster: selection preserved" "$SEL" "starter"

sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$WORK/pgdata" -w stop >/dev/null 2>&1 || true
rm -rf "$WORK"
[ "$fail" = "0" ] && echo "ALL PASS" || { echo "FAILURES"; exit 1; }
