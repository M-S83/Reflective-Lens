-- =============================================================================
-- 0013_disable_insights.sql — switch off the insights learning loop for dispatch.
-- The insights feature is half-built: it surfaced repetitive prompts, which in a
-- reflection tool reads as "the system isn't listening". It does not ship until
-- it is rebuilt as cross-store linked open questions (the #1 post-dispatch build).
--
-- PRESERVED: the `insights` table, the `insight_type` enum, and the
-- `update-insights` generator function. Only the automatic loop is switched off:
--   • the observation trigger that flags an insights pass, and
--   • the run-learning fan-out (removed in code).
-- Re-enable by recreating the trigger below and restoring the run-learning call.
-- =============================================================================

drop trigger if exists learn_insights_from_observation on public.observations;

-- Clear the backlog so learning_due() stops returning users as needing an
-- insights pass. Nothing re-sets this now the trigger is gone. The voice-learning
-- half (learn_voice_from_observation / learn_voice_from_reflection) is untouched.
update public.learning_state
  set insights_pending_since = null
  where insights_pending_since is not null;
