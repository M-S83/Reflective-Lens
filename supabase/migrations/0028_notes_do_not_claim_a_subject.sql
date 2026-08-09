-- =============================================================================
-- 0028_notes_do_not_claim_a_subject.sql — stop storing a guess as a fact.
--
-- observations.subject_type was written as the literal 'team' by the app, on
-- every note, on every session, since 0001. Not derived, not asked, not checked:
-- a constant in two functions in db.ts.
--
-- It surfaced as a coach's 1v1 session, about one boy, coming back in a finished
-- report as "You noted the team had a bad at school". There is no team in a 1v1.
-- The coach never wrote the word. The report payload passed subject: "team" to
-- the model, the model had no reason to doubt it, and the app told a coach
-- something about a child that nobody had said.
--
-- The app now writes 'unknown', which is the truth: a coach types a sentence and
-- nothing asks who it was about. This migration makes the rows already saved
-- agree with that, because the wrong value is still sitting in the table and the
-- next thing to read it would repeat the bug in a new place.
--
-- Safe to run: nothing reads either column. That is also exactly why it went
-- unnoticed for so long, and why the comments below matter more than the
-- backfill. A field that is never read is a field nobody maintains, right up
-- until someone joins it into a prompt.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) The rows already saved.
-- -----------------------------------------------------------------------------
-- Every one of them says 'team' because the app could not say anything else,
-- so there is no subset here worth preserving: they are all the same guess.
update public.observations
   set subject_type = 'unknown'
 where subject_type = 'team';

-- -----------------------------------------------------------------------------
-- 2) Say so in the schema, where the next person will look.
-- -----------------------------------------------------------------------------
comment on column public.observations.subject_type is
  'NOT CAPTURED. Nothing in the app asks who a note is about and nothing infers '
  'it, so this is ''unknown'' for every note written through the app. Do not '
  'read it, and above all do not put it in a prompt: it previously read ''team'' '
  'unconditionally and produced a report about a team in a 1v1 session. If the '
  'app ever asks the coach, populate it then. See 0028.';

comment on column public.observations.observation_type is
  'NOT CAPTURED. The app no longer sets this, so rows take the column default. '
  'Nothing classifies a free-text note, so the value is a placeholder rather '
  'than a finding. Same warning as subject_type: do not feed it to a model. '
  'See 0028.';

-- -----------------------------------------------------------------------------
-- 3) The one that IS real, so the difference is on the record.
-- -----------------------------------------------------------------------------
-- custom_type is genuinely the coach's own word for the session ("1 V 1"), typed
-- by them, and it was already correct in the database. The single-session report
-- simply never asked for it, so a 1v1 reached the model as type: "other", which
-- says nothing, and the model filled the silence.
comment on column public.events.custom_type is
  'The coach''s own name for an ''other'' session, e.g. "1 V 1" or "goalkeeping". '
  'Real, coach-supplied, and safe to use. Read by generate-period-report and, '
  'since 0028, by generate-report: sending event_type ''other'' on its own told '
  'the model nothing and it invented the rest. See 0018 and 0028.';
