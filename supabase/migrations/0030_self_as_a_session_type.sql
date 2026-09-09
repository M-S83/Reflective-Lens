-- =============================================================================
-- 0030_self_as_a_session_type.sql: a reflection with no session to hang on.
--
-- Some reflection has no session behind it: handling a parent, losing your
-- temper on Saturday, whether you are the same coach on matchday as in
-- training, a values check at the start of a block. Without a home those
-- thoughts went in Thoughts and never got reflected on. 'Self' gives them one:
-- same capture (voice or text), same optional questions, a report shaped for
-- the coach rather than for a session (no hoped-to-see checklist, no squad).
--
-- WHY AN ENUM VALUE AND NOT custom_type. 0018 decided the enum stays small and
-- coach-named sessions go through custom_type, because a name alone drives no
-- behaviour. 'Self' does drive behaviour, by 0018's own test: the capture flow
-- drops the session-shaped tabs, the report drops the checklist and the squad
-- and takes a different shape, and the period report must keep these entries as
-- their own strand about the coach rather than fold them into the team's
-- picture. A behaviour-driving kind earns an enum value.
--
-- ADD VALUE only: the new values must not be USED in this migration (Postgres
-- refuses a new enum value inside the transaction that added it). Nothing else
-- changes; events made this way simply carry the new type.
-- =============================================================================

alter type public.event_type add value if not exists 'self_reflection';

comment on type public.event_type is
  'What kind of session an event is. self_reflection is a stand-alone coach '
  'reflection with no session behind it: the report it produces is shaped for '
  'the coach, and period reports keep its themes as their own strand.';

-- Its report is its own kind too, for the same reason: a self report has no
-- aims checklist and no squad, and the client asks for it by this name.
alter type public.report_type add value if not exists 'self_report';
