-- =============================================================================
-- 0007_profile_language.sql
-- A per-user language preference. British English for now; the column + the
-- shared AI house-style instruction (functions/_shared/voice.ts) read from it,
-- so adding more languages later is just a picker + a few more labels — no
-- rework of the generation functions.
-- =============================================================================
alter table public.profiles
  add column if not exists language text not null default 'en-GB';

comment on column public.profiles.language is
  'BCP-47-ish language tag driving AI output language (en-GB default). UI is English for now.';
