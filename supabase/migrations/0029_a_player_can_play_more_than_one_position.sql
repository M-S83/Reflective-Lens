-- =============================================================================
-- 0029_a_player_can_play_more_than_one_position.sql
--
-- players.position is a single text field, and at grassroots that is not how a
-- squad works. The player who fills in at right back when someone is missing is
-- the same player who plays in midfield the rest of the time, and a coach who
-- wants to write both had one box and a comma.
--
-- A comma in a text field is not the same as two positions. It reaches the
-- report prompt as the string "CM, RB", which the model reads as one thing, and
-- there is no way to show them as two, count them, or filter on one.
--
-- So the column becomes an array. The old one stays, empty of meaning:
-- dropping a column is irreversible, and this project has taken that view since
-- 0021. But it stays with a comment on it, because 0028 is the standing lesson
-- about what a leftover column does when the next person finds it and assumes
-- it means something.
-- =============================================================================

alter table public.players
  add column if not exists positions text[] not null default '{}';

-- Carry across what is already there, splitting on commas and slashes so a
-- coach who has already worked around the single box gets what they meant
-- rather than one long string. Trimmed, blanks dropped, order kept.
update public.players
   set positions = (
     select coalesce(array_agg(p order by ord), '{}')
       from (
         select btrim(tok) as p, ord
           from unnest(regexp_split_to_array(position, '\s*[,/]\s*')) with ordinality as t(tok, ord)
       ) s
      where s.p <> ''
   )
 where position is not null
   and btrim(position) <> ''
   and cardinality(positions) = 0;

comment on column public.players.positions is
  'The positions a player plays, in the coach''s own words and their own order. '
  'Free text on purpose: a coach says "left eight" or "false nine" and the app '
  'is not in the business of correcting them. Superseded players.position, '
  'which is NOT read any more (0029).';

comment on column public.players.position is
  'SUPERSEDED by players.positions (0029) and NOT READ by anything. Left in '
  'place because dropping a column cannot be undone, and backfilled from into '
  'the array rather than the other way round. Do not read it, do not write it, '
  'and do not put it in a prompt: it will be stale the moment a coach edits a '
  'player. If you need a single position, take positions[1]. See 0028 for what '
  'happens when a column nobody reads gets read.';
