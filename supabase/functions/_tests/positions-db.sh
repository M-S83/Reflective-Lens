#!/usr/bin/env bash
# Runnable PG16 check for 0029: a player can play more than one position.
#
# players.position was a single text box, so a coach with a player who covers
# right back and plays in midfield had a comma and nothing else. A comma is not
# two positions: it reaches the report prompt as one string, it cannot be shown
# as two, and nothing can filter on one of them.
#
# This asserts the new array column exists, that the backfill turns what coaches
# had already typed into real entries rather than one long string, and that the
# old column is left behind without being readable as truth.
set -euo pipefail
WORK="/var/tmp/rlpg_positions"; SOCK="$WORK/sock"
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

# Apply every migration EXCEPT 0029, seed the players a coach would already
# have, then apply 0029 on top. That is the only way to prove the backfill: run
# in order on an empty table it would have nothing to carry across.
$P -f "$WORK/bootstrap.sql" >/dev/null
for f in "$WORK"/0*.sql; do
  case "$(basename "$f")" in 0029_*) continue ;; esac
  $P -f "$f" >/dev/null
done

fail=0
chk() { if [ "$2" = "$3" ]; then echo "PASS: $1"; else echo "FAIL: $1 (got '$2', want '$3')"; fail=1; fi; }

$P >/dev/null <<'SQL'
insert into auth.users (id,email,raw_user_meta_data)
  values ('a0000000-0000-0000-0000-0000000000c1','pos@test','{"role":"coach"}');
insert into public.clubs (id, name, created_by)
  values ('a0000000-0000-0000-0000-0000000000b1','Riverside FC','a0000000-0000-0000-0000-0000000000c1');
insert into public.teams (id, club_id, name, age_group, format, created_by)
  values ('a0000000-0000-0000-0000-0000000000b2','a0000000-0000-0000-0000-0000000000b1','Lions','U12','9v9','a0000000-0000-0000-0000-0000000000c1');
-- What is actually in the box today: one position, a coach who used a comma,
-- one who used a slash, ragged spacing, an empty string, and a null.
insert into public.players (id, team_id, display_name, position, created_by) values
  ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000b2','One','CM','a0000000-0000-0000-0000-0000000000c1'),
  ('a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-0000000000b2','Two','CM, RB','a0000000-0000-0000-0000-0000000000c1'),
  ('a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-0000000000b2','Three','LW/ST','a0000000-0000-0000-0000-0000000000c1'),
  ('a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-0000000000b2','Four','  GK  ','a0000000-0000-0000-0000-0000000000c1'),
  ('a0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-0000000000b2','Five','','a0000000-0000-0000-0000-0000000000c1'),
  ('a0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-0000000000b2','Six',null,'a0000000-0000-0000-0000-0000000000c1'),
  ('a0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-0000000000b2','Seven','left eight, false nine','a0000000-0000-0000-0000-0000000000c1');
SQL

# --- the migration itself applies -------------------------------------------
if $P -f "$WORK/0029_a_player_can_play_more_than_one_position.sql" >/dev/null 2>&1; then
  echo "PASS: 0029 applies to a database that already has players in it"
else
  echo "FAIL: 0029 did not apply"; fail=1
fi

# --- the column ---------------------------------------------------------------
chk "positions is a text array" \
  "$($P -c "select data_type||':'||coalesce(udt_name,'') from information_schema.columns where table_name='players' and column_name='positions'")" \
  "ARRAY:_text"
chk "positions is never null" \
  "$($P -c "select is_nullable from information_schema.columns where table_name='players' and column_name='positions'")" \
  "NO"

# --- the backfill ---------------------------------------------------------------
chk "a single position carries across"      "$($P -c "select positions::text from public.players where display_name='One'")"   "{CM}"
chk "a comma becomes two entries"           "$($P -c "select positions::text from public.players where display_name='Two'")"   "{CM,RB}"
chk "a slash becomes two entries"           "$($P -c "select positions::text from public.players where display_name='Three'")" "{LW,ST}"
chk "ragged spacing is trimmed"             "$($P -c "select positions::text from public.players where display_name='Four'")"  "{GK}"
chk "an empty position stays empty"         "$($P -c "select positions::text from public.players where display_name='Five'")"  "{}"
chk "a null position stays empty"           "$($P -c "select positions::text from public.players where display_name='Six'")"   "{}"
# The coach's own words, not a controlled vocabulary. "left eight" is what some
# people call it and the app has no business correcting them.
chk "the coach's own words survive intact" \
  "$($P -c "select positions::text from public.players where display_name='Seven'")" '{"left eight","false nine"}'
chk "order is the order they typed" \
  "$($P -c "select positions[1]||'|'||positions[2] from public.players where display_name='Two'")" "CM|RB"

# --- running it twice must not double anything -------------------------------
$P -f "$WORK/0029_a_player_can_play_more_than_one_position.sql" >/dev/null
chk "the backfill is idempotent" "$($P -c "select positions::text from public.players where display_name='Two'")" "{CM,RB}"

# --- a new player needs nothing --------------------------------------------------
$P >/dev/null <<'SQL'
insert into public.players (id, team_id, display_name, created_by)
  values ('a0000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-0000000000b2','Eight','a0000000-0000-0000-0000-0000000000c1');
SQL
chk "a player added with no positions gets an empty array, not null" \
  "$($P -c "select positions::text from public.players where display_name='Eight'")" "{}"

# --- several positions round-trip ------------------------------------------------
$P >/dev/null <<'SQL'
update public.players set positions = array['RB','CM','LW'] where display_name='Eight';
SQL
chk "three positions store and read back" \
  "$($P -c "select array_length(positions,1) from public.players where display_name='Eight'")" "3"

# --- the old column is marked, so the next person does not trust it -----------
chk "players.position carries a comment saying it is superseded" \
  "$($P -c "select case when col_description('public.players'::regclass, (select attnum from pg_attribute where attrelid='public.players'::regclass and attname='position')) ilike '%SUPERSEDED%' then 'yes' else 'no' end")" \
  "yes"
chk "the comment says it is not read" \
  "$($P -c "select case when col_description('public.players'::regclass, (select attnum from pg_attribute where attrelid='public.players'::regclass and attname='position')) ilike '%NOT READ%' then 'yes' else 'no' end")" \
  "yes"

# --- nothing in the app reads it any more ---------------------------------------
# The point of 0028 was that a column nobody reads eventually gets read. The
# comment is the warning; this is the check.
#
# Resolved to a real path, and _tests excluded by --exclude-dir rather than by
# filtering the output. The first version built SRC as ".../_tests/../.." and
# then dropped every line whose path matched "_tests/", which was every line,
# so the check passed while generate-report was still reading the old column.
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
HITS="$(grep -rn "players\.position\b\|players?\.position\b" \
  "$SRC/functions" "$SRC/../web/src" \
  --include=*.ts --include=*.tsx --exclude-dir=_tests 2>/dev/null || true)"
if [ -n "$HITS" ]; then
  echo "FAIL: something still reads players.position"; echo "$HITS"; fail=1
else
  echo "PASS: nothing reads players.position any more"
fi

sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$WORK/pgdata" -m immediate stop >/dev/null 2>&1 || true
[ "$fail" = "0" ] && echo "ALL PASS" || { echo "SOME FAILED"; exit 1; }
