#!/usr/bin/env bash
# Runnable PG16 check: deleting a session takes everything in it, and nothing
# outside it.
#
# deleteEvent existed in db.ts from the start and nothing ever called it, so
# until now the only way to remove one session was to delete the whole account.
# Two things have to be true before it is offered on a screen:
#
#   1. The cascade really does reach every table, including the follow-up
#      answers, which hang off the reflection rather than off the event.
#   2. It stops at the boundary. Another session, another coach, and the squad
#      itself must all survive: players belong to the team, not to the game.
#
# The recordings are the part Postgres cannot help with. They live in a storage
# bucket that no foreign key knows about, so db.ts gathers the paths before the
# delete and removes them afterwards. This asserts the columns that gathering
# depends on, and that it is actually wired up.
set -euo pipefail
WORK="/var/tmp/rlpg_delete"; SOCK="$WORK/sock"
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

# Two coaches. Coach A has two sessions on the same team, both fully populated,
# so "it deleted the right one" is a real assertion rather than "it deleted".
$P >/dev/null <<'SQL'
insert into auth.users (id,email,raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000a','a@test','{"role":"coach"}'),
  ('d0000000-0000-0000-0000-00000000000b','b@test','{"role":"coach"}');
insert into public.clubs (id, name, created_by)
  values ('d0000000-0000-0000-0000-0000000000c1','Riverside FC','d0000000-0000-0000-0000-00000000000a');
insert into public.teams (id, club_id, name, age_group, format, created_by)
  values ('d0000000-0000-0000-0000-000000000a11','d0000000-0000-0000-0000-0000000000c1','Lions','U12','9v9','d0000000-0000-0000-0000-00000000000a');
insert into public.players (id, team_id, display_name, positions, created_by)
  values ('d0000000-0000-0000-0000-000000000b11','d0000000-0000-0000-0000-000000000a11','Oscar',array['CM','RB'],'d0000000-0000-0000-0000-00000000000a');

-- The session being deleted, and the one that must survive.
insert into public.events (id, user_id, team_id, club_id, event_type, title, status) values
  ('d0000000-0000-0000-0000-0000000000e1','d0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-000000000a11','d0000000-0000-0000-0000-0000000000c1','training_session','Doomed','completed'),
  ('d0000000-0000-0000-0000-0000000000e2','d0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-000000000a11','d0000000-0000-0000-0000-0000000000c1','training_session','Keeper','completed');

-- Everything that hangs off a session, on both of them.
insert into public.observations (id, event_id, user_id, raw_note, audio_path) values
  ('d0000000-0000-0000-0000-00000000d001','d0000000-0000-0000-0000-0000000000e1','d0000000-0000-0000-0000-00000000000a','went long again','uid/e1/note.webm'),
  ('d0000000-0000-0000-0000-00000000d002','d0000000-0000-0000-0000-0000000000e2','d0000000-0000-0000-0000-00000000000a','kept it','uid/e2/note.webm');
insert into public.reflections (id, event_id, user_id, reflection_type, raw_transcript, audio_path) values
  ('d0000000-0000-0000-0000-00000000f001','d0000000-0000-0000-0000-0000000000e1','d0000000-0000-0000-0000-00000000000a','coach','I rushed it','uid/e1/reflection.webm'),
  ('d0000000-0000-0000-0000-00000000f002','d0000000-0000-0000-0000-0000000000e2','d0000000-0000-0000-0000-00000000000a','coach','better','uid/e2/reflection.webm');
insert into public.followup_questions (id, reflection_id, question_text) values
  ('d0000000-0000-0000-0000-0000000ab001','d0000000-0000-0000-0000-00000000f001','What did that look like?'),
  ('d0000000-0000-0000-0000-0000000ab002','d0000000-0000-0000-0000-00000000f002','And that?');
insert into public.followup_answers (id, question_id, answer_text, audio_path) values
  ('d0000000-0000-0000-0000-0000000ac001','d0000000-0000-0000-0000-0000000ab001','messy','uid/answers/a1.webm'),
  ('d0000000-0000-0000-0000-0000000ac002','d0000000-0000-0000-0000-0000000ab002','fine','uid/answers/a2.webm');
insert into public.event_attendance (event_id, player_id, status) values
  ('d0000000-0000-0000-0000-0000000000e1','d0000000-0000-0000-0000-000000000b11','present'),
  ('d0000000-0000-0000-0000-0000000000e2','d0000000-0000-0000-0000-000000000b11','present');
insert into public.reports (id, event_id, created_by, report_type, title) values
  ('d0000000-0000-0000-0000-0000000ad001','d0000000-0000-0000-0000-0000000000e1','d0000000-0000-0000-0000-00000000000a','training_report','Doomed report'),
  ('d0000000-0000-0000-0000-0000000ad002','d0000000-0000-0000-0000-0000000000e2','d0000000-0000-0000-0000-00000000000a','training_report','Keeper report');
SQL

# --- the paths the app gathers are reachable before the delete ----------------
# db.ts reads these three columns to know what to remove from the bucket. If a
# future migration renames one, the audio silently starts surviving the delete.
chk "an observation's audio path is readable" \
  "$($P -c "select audio_path from public.observations where id='d0000000-0000-0000-0000-00000000d001'")" "uid/e1/note.webm"
chk "a reflection's audio path is readable" \
  "$($P -c "select audio_path from public.reflections where id='d0000000-0000-0000-0000-00000000f001'")" "uid/e1/reflection.webm"
chk "an answer's audio path is reachable through the reflection" \
  "$($P -c "select a.audio_path from public.followup_answers a join public.followup_questions q on q.id=a.question_id join public.reflections r on r.id=q.reflection_id where r.event_id='d0000000-0000-0000-0000-0000000000e1'")" \
  "uid/answers/a1.webm"

# --- delete one session --------------------------------------------------------
$P -c "delete from public.events where id='d0000000-0000-0000-0000-0000000000e1'" >/dev/null

# --- everything in it is gone ---------------------------------------------------
chk "the session is gone"          "$($P -c "select count(*) from public.events where id='d0000000-0000-0000-0000-0000000000e1'")" "0"
chk "its notes are gone"           "$($P -c "select count(*) from public.observations where id='d0000000-0000-0000-0000-00000000d001'")" "0"
chk "its reflection is gone"       "$($P -c "select count(*) from public.reflections where id='d0000000-0000-0000-0000-00000000f001'")" "0"
chk "its questions are gone"       "$($P -c "select count(*) from public.followup_questions where id='d0000000-0000-0000-0000-0000000ab001'")" "0"
# The one most likely to be missed: answers are two hops from the event.
chk "its answers are gone"         "$($P -c "select count(*) from public.followup_answers where id='d0000000-0000-0000-0000-0000000ac001'")" "0"
chk "its attendance is gone"       "$($P -c "select count(*) from public.event_attendance where event_id='d0000000-0000-0000-0000-0000000000e1'")" "0"
chk "its report is gone"           "$($P -c "select count(*) from public.reports where id='d0000000-0000-0000-0000-0000000ad001'")" "0"

# --- and it stopped there --------------------------------------------------------
chk "the other session survives"   "$($P -c "select count(*) from public.events where id='d0000000-0000-0000-0000-0000000000e2'")" "1"
chk "its notes survive"            "$($P -c "select count(*) from public.observations where id='d0000000-0000-0000-0000-00000000d002'")" "1"
chk "its reflection survives"      "$($P -c "select count(*) from public.reflections where id='d0000000-0000-0000-0000-00000000f002'")" "1"
chk "its answers survive"          "$($P -c "select count(*) from public.followup_answers where id='d0000000-0000-0000-0000-0000000ac002'")" "1"
chk "its report survives"          "$($P -c "select count(*) from public.reports where id='d0000000-0000-0000-0000-0000000ad002'")" "1"
# A player belongs to the team, not to the game. Deleting a session must never
# take someone out of the squad.
chk "the player is still in the squad" "$($P -c "select count(*) from public.players where id='d0000000-0000-0000-0000-000000000b11'")" "1"
chk "the team survives"            "$($P -c "select count(*) from public.teams where id='d0000000-0000-0000-0000-000000000a11'")" "1"

# --- RLS: only the owner can do it ----------------------------------------------
# events is "for all using (user_id = auth.uid())", so this is really asking
# whether that policy covers DELETE as well as SELECT.
#
# The role and the GUC have to be set in the SAME transaction as the delete.
# Written as bare SET LOCAL statements first, which outside a transaction are a
# no-op with only a warning, so the delete ran as superuser, wiped the row and
# the check reported that RLS had failed. The RLS was fine; the test was not.
as_user() { # $1=uid, $2=sql
  $P >/dev/null 2>&1 <<SQL || true
begin;
set local role authenticated;
select set_config('test.uid','$1',true);
$2
commit;
SQL
}

as_user 'd0000000-0000-0000-0000-00000000000b' \
  "delete from public.events where id='d0000000-0000-0000-0000-0000000000e2';"
chk "another coach cannot delete your session" \
  "$($P -c "select count(*) from public.events where id='d0000000-0000-0000-0000-0000000000e2'")" "1"

as_user 'd0000000-0000-0000-0000-00000000000a' \
  "delete from public.events where id='d0000000-0000-0000-0000-0000000000e2';"
chk "the owner can delete their own session" \
  "$($P -c "select count(*) from public.events where id='d0000000-0000-0000-0000-0000000000e2'")" "0"

# --- the app actually clears the bucket ------------------------------------------
# The cascade above is rows only. Without this the coach who deletes a session
# because of what they said in it keeps the voice note.
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
DB="$SRC/../web/src/lib/db.ts"
grep -q 'storage.from("audio-recordings").remove' "$DB" \
  && echo "PASS: deleteEvent removes the recordings from storage" \
  || { echo "FAIL: deleteEvent leaves the recordings behind"; fail=1; }
# Gathered before the delete, or the rows naming them are already gone.
DEL_LINE="$(grep -n 'from("events").delete()' "$DB" | head -1 | cut -d: -f1)"
GATHER_LINE="$(grep -n 'from("observations").select("audio_path")' "$DB" | head -1 | cut -d: -f1)"
REMOVE_LINE="$(grep -n 'audio-recordings").remove' "$DB" | head -1 | cut -d: -f1)"
if [ -n "$DEL_LINE" ] && [ -n "$GATHER_LINE" ] && [ "$GATHER_LINE" -lt "$DEL_LINE" ]; then
  echo "PASS: the paths are gathered before the rows are deleted"
else
  echo "FAIL: the paths are gathered too late to be gathered at all"; fail=1
fi
if [ -n "$REMOVE_LINE" ] && [ "$REMOVE_LINE" -gt "$DEL_LINE" ]; then
  echo "PASS: the files go after the rows, so a storage hiccup cannot block the delete"
else
  echo "FAIL: storage removal is not after the row delete"; fail=1
fi
grep -q 'followup_answers").select("audio_path")' "$DB" \
  && echo "PASS: answer recordings are collected too (they are not filed under the event)" \
  || { echo "FAIL: answer recordings would be left in the bucket"; fail=1; }

sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$WORK/pgdata" -m immediate stop >/dev/null 2>&1 || true
[ "$fail" = "0" ] && echo "ALL PASS" || { echo "SOME FAILED"; exit 1; }
