-- =============================================================================
-- 0018_session_type.sql — let a coach name the kind of session.
--
-- event_type is an enum of four (training_session, match, tournament, other) and
-- it stays that way, because the first two drive real behaviour: a match has an
-- opposition, a result and a squad, and the period report compares training
-- against matches. What was missing is everything that is none of those: a
-- goalkeeping session, a one-to-one, a team meeting, a fitness block. They all
-- landed as 'other' and read back as "other".
--
-- So rather than growing the enum every time a coach invents a session (which
-- needs a migration, and is the app deciding what coaching looks like),
-- custom_type lets them name it in their own words. Consistent with the glossary
-- in 0017: the app uses the coach's language rather than its own.
--
-- WHY THIS IS A SCOPING FIX, NOT A LABEL. Sessions of different kinds have
-- different focuses, and a pattern from a goalkeeping session has no business
-- being read as a pattern of the team's outfield training. Naming the session is
-- what lets the period report keep those apart. See generate-period-report,
-- which now groups notes by session type and is told when a cross-type
-- connection is legitimate.
-- =============================================================================

alter table public.events
  add column if not exists custom_type text;

comment on column public.events.custom_type is
  'The coach''s own name for a session when event_type is ''other'' (for example '
  '"Goalkeeping session"). Used as the session label in reports. Null otherwise.';

-- Keep it a label, not an essay: it is shown as a heading and sent as a group
-- name in the period report payload.
alter table public.events
  add constraint events_custom_type_len
  check (custom_type is null or char_length(custom_type) <= 60);
