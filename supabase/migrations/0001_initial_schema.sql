-- =============================================================================
-- 0001_initial_schema.sql
-- Football Coaching & Player Reflection app (own-team analysis)
-- Core schema: enums + tables.
--
-- Product principle: "Mirror, not verdict."
-- The data model is built to help users reflect, organise and surface patterns.
-- =============================================================================

-- Useful extensions ----------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- =============================================================================
-- ENUMS
-- =============================================================================

create type user_role as enum (
  'coach',
  'player',
  'coach_developer',
  'admin'
);

create type event_type as enum (
  'training_session',
  'match',
  'tournament',
  'other',
  'coach_observation',
  'player_reflection'
);

create type event_status as enum (
  'draft',
  'live',
  'completed'
);

-- The format a team plays (scales with age group).
create type team_format as enum (
  '3v3',
  '5v5',
  '6v6',
  '7v7',
  '9v9',
  '11v11'
);

-- Whether a player was there for a given training/match.
create type attendance_status as enum (
  'present',
  'absent',
  'injured',
  'unavailable'
);

-- Category for a running player development note.
create type dev_note_category as enum (
  'strength',
  'development_area',
  'target',
  'general'
);

-- Matchday role, picked from the squad list (matches only).
--   starter            = in the XI
--   substitute         = named on the bench and came on
--   unused_substitute  = named on the bench, did not come on
create type squad_selection as enum (
  'starter',
  'substitute',
  'unused_substitute'
);

-- Match outcome from our team's perspective.
create type match_result as enum (
  'win',
  'draw',
  'loss'
);

-- A competition is a league or a cup. Names are editable (e.g. rename
-- "Cup 1" to "County Cup"); the kind drives how tables/standings behave.
create type competition_kind as enum (
  'league',
  'cup'
);

-- Whether a match was played at home, away, or a neutral venue.
create type home_away as enum (
  'home',
  'away',
  'neutral'
);

-- How a player featured in their own game (Player Mode self-log).
--   game_changer = came off the bench and changed the game.
create type player_match_role as enum (
  'started',
  'substitute',
  'game_changer'
);

create type team_sheet_source as enum (
  'image',
  'pdf',
  'manual'
);

-- Generic async processing status (team sheet OCR, transcription, etc.)
create type processing_status as enum (
  'pending',
  'processing',
  'completed',
  'failed'
);

-- How a live observation was captured
create type observation_input_type as enum (
  'voice_note',
  'text_note',
  'tag_only'
);

-- What the observation is about
create type observation_type as enum (
  'player_observation',
  'team_observation',
  'tactical_pattern',
  'technical_action',
  'physical_action',
  'psychological_behavioural',
  'set_piece',
  'moment_of_quality',
  'concern_risk',
  'follow_up_later'
);

create type subject_type as enum (
  'player',
  'team',
  'coach',
  'unit',
  'unknown'
);

create type sentiment as enum (
  'positive',
  'concern',
  'neutral'
);

-- When a note was captured, relative to the event it belongs to.
-- 'ad_hoc' notes are thoughts at any time and may not belong to an event.
create type capture_phase as enum (
  'pre_event',
  'live',
  'post_event',
  'ad_hoc'
);

create type reflection_type as enum (
  'coach',
  'player',
  'coach_developer'
);

create type question_type as enum (
  'multiple_choice',
  'voice',
  'text',
  'rating'
);

-- Reports come at different cadences. training/match are per-event;
-- weekly/monthly/season aggregate across a date range for a team (a weekly
-- report combines that week's training and match).
create type report_type as enum (
  'training_report',
  'match_report',
  'tournament_report',
  'other_report',
  'weekly_report',
  'monthly_report',
  'season_report',
  'player_report',
  'coach_observation'
);

create type insight_type as enum (
  'player_pattern',
  'team_pattern',
  'coach_development',
  'recurring_theme'
);

-- =============================================================================
-- CORE ORGANISATION TABLES
-- =============================================================================

-- Clubs / organisations -------------------------------------------------------
create table public.clubs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Profiles: 1:1 with Supabase auth users -------------------------------------
-- A user can be a coach, player, coach_developer or admin. A user can OWN many
-- clubs and teams (a coach at two clubs, a player at two teams); `club_id` here
-- is just an optional default/primary club for convenience — access is by
-- ownership, not by this field.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,                     -- from Supabase Auth (email sign-in)
  phone       text,                     -- from Supabase Auth (mobile sign-in)
  full_name   text,
  role        user_role not null default 'coach',
  club_id     uuid references public.clubs (id) on delete set null, -- optional default club
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_club_id_idx on public.profiles (club_id);

-- Teams: belong to a club -----------------------------------------------------
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  name        text not null,
  age_group   text,
  format      team_format not null,       -- 3v3 / 5v5 / 6v6 / 7v7 / 9v9 / 11v11
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index teams_club_id_idx on public.teams (club_id);

-- Players: belong to a team (nullable so a player extracted from a team sheet
-- can exist briefly before being linked to a team)
create table public.players (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid references public.teams (id) on delete set null,
  first_name    text,
  last_name     text,
  display_name  text,
  shirt_number  int,
  position      text,
  notes         text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index players_team_id_idx on public.players (team_id);

-- Coach voice profile: learned from the coach's OWN writing so every AI reply
-- comes back in their language, at their level. One row per user. This is how
-- "mirror, not verdict" extends to voice — the app adapts to whichever level of
-- coaching experience, rather than imposing textbook jargon.
create table public.coach_voice_profiles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references auth.users (id) on delete cascade,
  style_summary  text,                     -- natural-language description of their voice
  glossary       jsonb not null default '[]'::jsonb, -- characteristic terms/phrases they use
  language_level text,                      -- 'plain' | 'developing' | 'technical' (language, not skill)
  sample_count   int not null default 0,   -- how many of their notes it learned from
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Player development notes: a running coaching log per player over time -------
-- (strengths, areas to work on, targets) — separate from match observations.
create table public.player_development_notes (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  category    dev_note_category not null default 'general',
  note        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index player_development_notes_player_id_idx on public.player_development_notes (player_id);

-- Competitions: leagues / cups a team plays in, with editable names ----------
create table public.competitions (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  team_id     uuid references public.teams (id) on delete set null,
  name        text not null,              -- editable, e.g. "JPL Division 1", "County Cup"
  kind        competition_kind not null default 'league',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index competitions_club_id_idx on public.competitions (club_id);
create index competitions_team_id_idx on public.competitions (team_id);

-- =============================================================================
-- EVENTS  (everything starts with an event)
-- =============================================================================

create table public.events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  club_id         uuid references public.clubs (id) on delete set null,
  team_id         uuid references public.teams (id) on delete set null,
  competition_id  uuid references public.competitions (id) on delete set null, -- matches only
  event_type      event_type not null,
  title           text not null,
  event_date      date,
  opposition      text,                   -- the opponent for a match
  venue           text,
  focus_area      text,                   -- short theme tag, e.g. "Building under pressure"
  purpose         text,                   -- why you're running it — the aim of the session/match
  hoping_to_see   jsonb not null default '[]'::jsonb, -- observable things you hope to see (list of strings)
  status          event_status not null default 'draft',
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index events_user_id_idx on public.events (user_id);
create index events_club_id_idx on public.events (club_id);
create index events_team_id_idx on public.events (team_id);

-- =============================================================================
-- TEAM SHEET UPLOADS
-- =============================================================================

create table public.team_sheets (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events (id) on delete cascade,
  uploaded_by        uuid references auth.users (id) on delete set null,
  source             team_sheet_source not null default 'image',
  file_path          text,                 -- path within the `uploads` storage bucket
  extracted_text     text,
  processing_status  processing_status not null default 'pending',
  created_at         timestamptz not null default now()
);

create index team_sheets_event_id_idx on public.team_sheets (event_id);

-- Players extracted from an uploaded team sheet -------------------------------
-- Links shirt numbers / names to canonical players so live notes like
-- "Number 8 scans before receiving" can be attributed automatically.
create table public.team_sheet_players (
  id               uuid primary key default gen_random_uuid(),
  team_sheet_id    uuid not null references public.team_sheets (id) on delete cascade,
  player_id        uuid references public.players (id) on delete set null,
  shirt_number     int,
  player_name      text,
  position         text,
  team_name        text,
  is_starter       boolean not null default true,
  confidence_score numeric(4,3),           -- 0.000 - 1.000
  created_at       timestamptz not null default now()
);

create index team_sheet_players_sheet_id_idx on public.team_sheet_players (team_sheet_id);
create index team_sheet_players_player_id_idx on public.team_sheet_players (player_id);

-- =============================================================================
-- OBSERVATIONS / NOTES
-- Atomic notes captured before, during or after an event — or ad-hoc thoughts
-- at any time. Ad-hoc notes have no event (event_id is null) and can still be
-- scoped to a team and/or player. The deeper structured write-up after an event
-- lives separately in `reflections`.
-- =============================================================================

create table public.observations (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid references public.events (id) on delete cascade, -- null for ad-hoc notes
  user_id           uuid not null references auth.users (id) on delete cascade,
  team_id           uuid references public.teams (id) on delete set null, -- for ad-hoc scoping
  capture_phase     capture_phase not null default 'live',
  timestamp_seconds int,                   -- offset within the recording/session
  match_minute      int,
  input_type        observation_input_type not null default 'text_note',
  observation_type  observation_type not null default 'player_observation',
  subject_type      subject_type not null default 'unknown',
  player_id         uuid references public.players (id) on delete set null,
  shirt_number      int,
  raw_note          text,                  -- original transcription / text
  cleaned_note      text,                  -- AI-cleaned (mirror, not verdict)
  tags              text[] not null default '{}',
  sentiment         sentiment not null default 'neutral',
  phase_of_play     text,                  -- tactical phase (build_up, etc.), distinct from capture_phase
  confidence_score  numeric(4,3),
  audio_path        text,                  -- path within `audio-recordings` bucket
  created_at        timestamptz not null default now()
);

create index observations_event_id_idx on public.observations (event_id);
create index observations_user_id_idx on public.observations (user_id);
create index observations_team_id_idx on public.observations (team_id);
create index observations_player_id_idx on public.observations (player_id);
create index observations_tags_idx on public.observations using gin (tags);

-- =============================================================================
-- ATTENDANCE  (tick who was there — training or match)
-- =============================================================================

create table public.event_attendance (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  player_id   uuid not null references public.players (id) on delete cascade,
  status      attendance_status not null default 'present',
  selection   squad_selection,            -- starter / substitute / unused_substitute (matches; null for training)
  position    text,                       -- lineup position for this match, e.g. 'CM', 'LW'
  created_at  timestamptz not null default now(),
  unique (event_id, player_id)
);

create index event_attendance_event_id_idx on public.event_attendance (event_id);
create index event_attendance_player_id_idx on public.event_attendance (player_id);

-- =============================================================================
-- MATCH RECORD  (score + per-player stats — match events only)
-- =============================================================================

-- One row per match event: the scoreline. `result` is derived automatically.
create table public.match_details (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null unique references public.events (id) on delete cascade,
  home_away         home_away,
  formation         text,                 -- e.g. '4-3-3'
  goals_for         int not null default 0,
  goals_against     int not null default 0,
  result            match_result generated always as (
                       case
                         when goals_for > goals_against then 'win'::match_result
                         when goals_for < goals_against then 'loss'::match_result
                         else 'draw'::match_result
                       end
                     ) stored,
  man_of_the_match  uuid references public.players (id) on delete set null,
  notes             text,
  created_at        timestamptz not null default now()
);

-- One row per player per match: goals, assists, cards, clean sheet, minutes.
create table public.match_stats (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events (id) on delete cascade,
  player_id       uuid not null references public.players (id) on delete cascade,
  goals           int not null default 0,
  assists         int not null default 0,
  yellow_cards    int not null default 0,
  red_cards       int not null default 0,
  clean_sheet     boolean not null default false,
  minutes_played  int,
  created_at      timestamptz not null default now(),
  unique (event_id, player_id)
);

create index match_stats_event_id_idx on public.match_stats (event_id);
create index match_stats_player_id_idx on public.match_stats (player_id);

-- =============================================================================
-- PLAYER GAME LOG  (Player Mode) — the player's OWN record of their game,
-- logged with their reflection and independent of any coach data: the
-- position(s) they played, whether they started or changed the game, and the
-- match details. Private to the player.
-- =============================================================================

create table public.player_game_log (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null unique references public.events (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  positions      text[] not null default '{}',   -- position(s) they played, e.g. {CM, LW}
  role           player_match_role,               -- started / substitute / game_changer
  home_away      home_away,
  opposition     text,
  goals_for      int,
  goals_against  int,
  result         match_result generated always as (
                    case
                      when goals_for is null or goals_against is null then null::match_result
                      when goals_for > goals_against then 'win'::match_result
                      when goals_for < goals_against then 'loss'::match_result
                      else 'draw'::match_result
                    end
                  ) stored,
  minutes_played int,
  my_goals       int not null default 0,
  my_assists     int not null default 0,
  created_at     timestamptz not null default now()
);

create index player_game_log_user_id_idx on public.player_game_log (user_id);

-- =============================================================================
-- POST-EVENT REFLECTIONS
-- =============================================================================

create table public.reflections (
  id                   uuid primary key default gen_random_uuid(),
  event_id             uuid not null references public.events (id) on delete cascade,
  user_id              uuid not null references auth.users (id) on delete cascade,
  reflection_type      reflection_type not null,
  raw_transcript       text,               -- text typed, or transcript of a voice reflection
  summary              text,               -- the coach's own reflection summary
  enriched_summary     text,               -- summary re-woven with follow-up context (null until enriched)
  -- Structured lists kept as JSONB arrays of strings/objects.
  what_went_well       jsonb not null default '[]'::jsonb,
  what_did_not_work    jsonb not null default '[]'::jsonb,
  learning_evidence    jsonb not null default '[]'::jsonb,
  action_points        jsonb not null default '[]'::jsonb,
  suggested_next_focus  jsonb not null default '[]'::jsonb,
  -- Each event.hoping_to_see item checked against the live notes:
  -- [{ "item": text, "status": "showed_up"|"partly"|"not_observed", "evidence": text }]
  hoped_to_see_review  jsonb not null default '[]'::jsonb,
  audio_path           text,               -- path within `audio-recordings` bucket
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index reflections_event_id_idx on public.reflections (event_id);
create index reflections_user_id_idx on public.reflections (user_id);

-- =============================================================================
-- INTERACTIVE FOLLOW-UP QUESTIONS  (always skippable)
-- =============================================================================

create table public.followup_questions (
  id             uuid primary key default gen_random_uuid(),
  reflection_id  uuid not null references public.reflections (id) on delete cascade,
  question_text  text not null,
  question_type  question_type not null default 'text',
  options        jsonb not null default '[]'::jsonb,  -- for multiple_choice / rating
  skipped        boolean not null default false,
  created_at     timestamptz not null default now()
);

create index followup_questions_reflection_id_idx on public.followup_questions (reflection_id);

create table public.followup_answers (
  id               uuid primary key default gen_random_uuid(),
  question_id      uuid not null references public.followup_questions (id) on delete cascade,
  answer_text      text,
  selected_option  text,
  audio_path       text,                   -- path within `audio-recordings` bucket
  created_at       timestamptz not null default now()
);

create index followup_answers_question_id_idx on public.followup_answers (question_id);

-- =============================================================================
-- GENERATED REPORTS
-- =============================================================================

create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid references public.events (id) on delete cascade, -- null for period reports
  team_id           uuid references public.teams (id) on delete set null, -- set for monthly/season reports
  created_by        uuid references auth.users (id) on delete set null,
  report_type       report_type not null,
  title             text not null,
  period_start      date,                  -- monthly / season reports
  period_end        date,
  content_json      jsonb not null default '{}'::jsonb,
  content_markdown  text,
  pdf_path          text,                  -- path within `reports` bucket
  created_at        timestamptz not null default now()
);

create index reports_event_id_idx on public.reports (event_id);
create index reports_team_id_idx on public.reports (team_id);

-- Explicit grants of access to a report (beyond owner / club admin) -----------
create table public.report_access (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  granted_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (report_id, user_id)
);

create index report_access_user_id_idx on public.report_access (user_id);

-- =============================================================================
-- LONG-TERM INSIGHTS  (pattern intelligence)
-- =============================================================================

create table public.insights (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  club_id          uuid references public.clubs (id) on delete set null,
  team_id          uuid references public.teams (id) on delete set null,
  player_id        uuid references public.players (id) on delete set null,
  insight_type      insight_type not null,
  title             text not null,
  description       text,
  sentiment         sentiment,             -- concern vs progress, drives the prompt tone
  -- A reflective, forward-looking nudge for a recurring theme, e.g.
  -- "flagged 3 of the last 4 weeks — how will you tackle it?" (concern) or
  -- "progressed across the period — what have you done to let them know?" (positive)
  reflective_prompt text,
  evidence_count    int not null default 1,
  confidence_score  numeric(4,3),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index insights_user_id_idx on public.insights (user_id);
create index insights_player_id_idx on public.insights (player_id);
create index insights_team_id_idx on public.insights (team_id);

-- =============================================================================
-- PLAYER STATS  (accumulated totals rolled up for a player's profile)
-- A read-only view over data already stored — always current, never duplicated.
-- security_invoker = true so the querying user's RLS on the base tables applies.
-- =============================================================================

create view public.player_stats
  with (security_invoker = true) as
select
  p.id                                    as player_id,
  p.team_id,
  coalesce(app.appearances, 0)            as appearances,
  coalesce(m.goals, 0)                    as goals,
  coalesce(m.assists, 0)                  as assists,
  coalesce(m.yellow_cards, 0)             as yellow_cards,
  coalesce(m.red_cards, 0)                as red_cards,
  coalesce(m.clean_sheets, 0)             as clean_sheets,
  coalesce(m.minutes_played, 0)           as minutes_played,
  coalesce(tr.trainings_attended, 0)      as trainings_attended
from public.players p
left join (
  select ms.player_id,
         sum(ms.goals)                          as goals,
         sum(ms.assists)                        as assists,
         sum(ms.yellow_cards)                   as yellow_cards,
         sum(ms.red_cards)                      as red_cards,
         count(*) filter (where ms.clean_sheet) as clean_sheets,
         sum(coalesce(ms.minutes_played, 0))    as minutes_played
  from public.match_stats ms
  group by ms.player_id
) m on m.player_id = p.id
left join (
  -- an appearance = started or came on as a sub (unused subs don't count)
  select a.player_id, count(*) as appearances
  from public.event_attendance a
  join public.events e on e.id = a.event_id and e.event_type = 'match'
  where a.selection in ('starter', 'substitute')
  group by a.player_id
) app on app.player_id = p.id
left join (
  select a.player_id, count(*) as trainings_attended
  from public.event_attendance a
  join public.events e on e.id = a.event_id and e.event_type = 'training_session'
  where a.status = 'present'
  group by a.player_id
) tr on tr.player_id = p.id;

-- =============================================================================
-- updated_at trigger helper
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create trigger reflections_set_updated_at
  before update on public.reflections
  for each row execute function public.set_updated_at();

create trigger insights_set_updated_at
  before update on public.insights
  for each row execute function public.set_updated_at();

create trigger player_development_notes_set_updated_at
  before update on public.player_development_notes
  for each row execute function public.set_updated_at();

create trigger coach_voice_profiles_set_updated_at
  before update on public.coach_voice_profiles
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Auto-create a profile row when a new auth user signs up
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, phone, full_name, role)
  values (
    new.id,
    new.email,
    new.phone,                              -- mobile sign-in (email and/or phone)
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'coach')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
