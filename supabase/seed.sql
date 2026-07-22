-- =============================================================================
-- seed.sql
-- Example seed data for local development.
--
--   1 club, 1 team, 3 players,
--   1 match, 1 training session,
--   a few live observations.
--
-- A demo auth user is created so foreign keys resolve. In a real Supabase
-- project you would normally sign up through Supabase Auth; this is only for
-- `supabase db reset` / local seeding.
-- =============================================================================

-- Fixed UUIDs so the seed is deterministic / re-runnable.
-- coach user
\set coach_id            '11111111-1111-1111-1111-111111111111'
\set club_id             '22222222-2222-2222-2222-222222222222'
\set team_id             '33333333-3333-3333-3333-333333333333'
\set player_oscar        '44444444-4444-4444-4444-444444444401'
\set player_maya         '44444444-4444-4444-4444-444444444402'
\set player_jay          '44444444-4444-4444-4444-444444444403'
\set match_event_id      '55555555-5555-5555-5555-555555555501'
\set training_event_id   '55555555-5555-5555-5555-555555555502'
\set league_comp_id      '66666666-6666-6666-6666-666666666601'
\set cup_comp_id         '66666666-6666-6666-6666-666666666602'
\set reflection_id       '77777777-7777-7777-7777-777777777701'
\set question_id         '88888888-8888-8888-8888-888888888801'

-- Demo auth user (bypasses normal signup). -----------------------------------
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  :'coach_id',
  'coach@enfieldtownyouth.test',
  '{"full_name": "Sam Coach", "role": "coach"}'::jsonb,
  now(), now()
)
on conflict (id) do nothing;

-- Club ------------------------------------------------------------------------
insert into public.clubs (id, name, created_by)
values (:'club_id', 'Enfield Town Youth', :'coach_id')
on conflict (id) do nothing;

-- Make sure the coach profile points at the club (the new-user trigger
-- created the profile row already; we just enrich it).
update public.profiles
   set full_name = 'Sam Coach', role = 'coach', club_id = :'club_id'
 where id = :'coach_id';

-- Team ------------------------------------------------------------------------
insert into public.teams (id, club_id, name, age_group, format, created_by)
values (:'team_id', :'club_id', 'U15 JPL', 'U15', '11v11', :'coach_id')
on conflict (id) do nothing;

-- Competitions (editable names) -----------------------------------------------
insert into public.competitions (id, club_id, team_id, name, kind, created_by)
values
  (:'league_comp_id', :'club_id', :'team_id', 'JPL Division 1', 'league', :'coach_id'),
  (:'cup_comp_id',    :'club_id', :'team_id', 'County Cup',     'cup',    :'coach_id')
on conflict (id) do nothing;

-- Players ---------------------------------------------------------------------
insert into public.players
  (id, team_id, first_name, last_name, display_name, shirt_number, position, notes, created_by)
values
  (:'player_oscar', :'team_id', 'Oscar', 'Reed',  'Oscar',  8,  'Central Midfield', 'Good at finding space', :'coach_id'),
  (:'player_maya',  :'team_id', 'Maya',  'Lewis', 'Maya',   6,  'Defensive Midfield', null,                  :'coach_id'),
  (:'player_jay',   :'team_id', 'Jay',   'Owens', 'Jay',    11, 'Left Wing', null,                            :'coach_id')
on conflict (id) do nothing;

-- Coach voice profile (learned from the coach's own writing) -------------------
insert into public.coach_voice_profiles
  (user_id, style_summary, glossary, language_level, sample_count)
values (
  :'coach_id',
  'Grassroots youth coach. Plain, encouraging, practical language — talks about what he sees, not textbook theory. Prefers everyday phrasing over tactical jargon.',
  '["get his head up","first touch","play out from the back","shape","scanning","under pressure","half-turn","middle third"]'::jsonb,
  'plain',
  12
)
on conflict (user_id) do nothing;

-- Player development notes (a running coaching log) ---------------------------
insert into public.player_development_notes (player_id, user_id, category, note)
values
  (:'player_oscar', :'coach_id', 'strength',         'Excellent scanning and awareness before receiving.'),
  (:'player_oscar', :'coach_id', 'development_area', 'Can be caught in possession under a heavy press.'),
  (:'player_oscar', :'coach_id', 'target',           'Take up more half-space receiving positions this block.')
on conflict (id) do nothing;

-- Events ----------------------------------------------------------------------
insert into public.events
  (id, user_id, club_id, team_id, competition_id, event_type, title, event_date, opposition, venue,
   focus_area, purpose, hoping_to_see, status, started_at, ended_at)
values
  (:'training_event_id', :'coach_id', :'club_id', :'team_id', null, 'training_session',
   'Tuesday Session — Playing Out From The Back', '2026-06-16', null, 'Home Ground',
   'Building under pressure',
   'Help the team keep the ball in the first phase when pressed high.',
   '["Players scanning before they receive","Centre-backs splitting to create angles","Keeper used as a spare man","Calm decisions under pressure"]'::jsonb,
   'completed', '2026-06-16 18:00:00+00', '2026-06-16 19:30:00+00'),
  (:'match_event_id', :'coach_id', :'club_id', :'team_id', :'league_comp_id', 'match',
   'JPL Division 1 vs Barnet Youth', '2026-06-18', 'Barnet Youth', 'Home Ground',
   'Our build-up shape',
   'See whether the week''s build-up work holds up against a real press.',
   '["Composure playing out from the back","Midfield finding space between lines","Full-backs offering width in build-up"]'::jsonb,
   'completed', '2026-06-18 15:00:00+00', '2026-06-18 16:45:00+00')
on conflict (id) do nothing;

-- Pre-training note (planning thought before the session) ---------------------
insert into public.observations
  (event_id, user_id, team_id, capture_phase, input_type, observation_type,
   subject_type, raw_note, cleaned_note, tags, sentiment)
values
  (:'training_event_id', :'coach_id', :'team_id', 'pre_event', 'text_note', 'follow_up_later',
   'team', 'want to see if they can build out under a press today',
   'Focus: can the team build out under pressure today?',
   array['plan','build_up'], 'neutral');

-- Live observations (during the training session) -----------------------------
insert into public.observations
  (event_id, user_id, team_id, capture_phase, timestamp_seconds, match_minute, input_type,
   observation_type, subject_type, player_id, shirt_number, raw_note, cleaned_note, tags, sentiment, phase_of_play)
values
  (:'training_event_id', :'coach_id', :'team_id', 'live', 320, 5, 'text_note', 'technical_action',
   'player', :'player_oscar', 8,
   'oscar scans before receiving good',
   'Oscar scans before receiving.',
   array['scanning','receiving','awareness'], 'positive', 'build_up'),

  (:'training_event_id', :'coach_id', :'team_id', 'live', 1100, 18, 'voice_note', 'concern_risk',
   'team', null, null,
   'session got a bit chaotic in the middle third',
   'The session became chaotic in the middle third.',
   array['organisation','chaos'], 'concern', 'middle_third'),

  (:'training_event_id', :'coach_id', :'team_id', 'live', 1850, 31, 'tag_only', 'moment_of_quality',
   'player', :'player_jay', 11,
   null, null,
   array['1v1','beat_defender'], 'positive', 'attacking_third');

-- Post-training quick note (a thought right after) ----------------------------
insert into public.observations
  (event_id, user_id, team_id, capture_phase, input_type, observation_type,
   subject_type, raw_note, cleaned_note, tags, sentiment)
values
  (:'training_event_id', :'coach_id', :'team_id', 'post_event', 'voice_note', 'team_observation',
   'team', 'constraints were too loose in the middle block, tighten next week',
   'The constraints in the middle block were too loose; tighten them next week.',
   array['constraints','organisation'], 'concern');

-- Ad-hoc note (a thought at any time, not tied to any event) -------------------
insert into public.observations
  (event_id, user_id, team_id, capture_phase, input_type, observation_type,
   subject_type, player_id, raw_note, cleaned_note, tags, sentiment)
values
  (null, :'coach_id', :'team_id', 'ad_hoc', 'voice_note', 'follow_up_later',
   'player', :'player_oscar',
   'idea give oscar a half-space receiving role next block',
   'Idea: try Oscar in a half-space receiving role next training block.',
   array['idea','role','oscar'], 'neutral');

-- Attendance & matchday selection ---------------------------------------------
-- Training: just who turned up. Match: starters / subs picked from the squad.
insert into public.event_attendance (event_id, player_id, status, selection, position)
values
  (:'training_event_id', :'player_oscar', 'present', null,         null),
  (:'training_event_id', :'player_maya',  'present', null,         null),
  (:'training_event_id', :'player_jay',   'injured', null,         null),
  (:'match_event_id',    :'player_oscar', 'present', 'starter',    'CM'),
  (:'match_event_id',    :'player_maya',  'present', 'starter',    'DM'),
  (:'match_event_id',    :'player_jay',   'present', 'substitute', 'LW')
on conflict (event_id, player_id) do nothing;

-- Match record: scoreline, venue side, man of the match -----------------------
insert into public.match_details
  (event_id, home_away, formation, goals_for, goals_against, man_of_the_match, notes)
values
  (:'match_event_id', 'home', '4-3-3', 2, 0, :'player_oscar',
   'Clean sheet held under late pressure; controlled build-up throughout.')
on conflict (event_id) do nothing;

-- Per-player match stats (who scored, assists, cards, clean sheets) -----------
insert into public.match_stats
  (event_id, player_id, goals, assists, yellow_cards, red_cards, clean_sheet, minutes_played)
values
  (:'match_event_id', :'player_oscar', 1, 1, 0, 0, false, 90),
  (:'match_event_id', :'player_jay',   1, 0, 1, 0, false, 78),
  (:'match_event_id', :'player_maya',  0, 1, 0, 0, true,  90)
on conflict (event_id, player_id) do nothing;

-- Observations across the match (pre / live / post) ---------------------------
insert into public.observations
  (event_id, user_id, team_id, capture_phase, timestamp_seconds, match_minute, input_type,
   observation_type, subject_type, player_id, shirt_number, raw_note, cleaned_note, tags, sentiment, phase_of_play)
values
  -- before kick-off
  (:'match_event_id', :'coach_id', :'team_id', 'pre_event', null, null, 'text_note', 'follow_up_later',
   'team', null, null,
   'watch how we handle their high press early on',
   'Watch how we handle their high press in the opening spell.',
   array['plan','press'], 'neutral', null),
  -- during the match
  (:'match_event_id', :'coach_id', :'team_id', 'live', 600, 10, 'text_note', 'tactical_pattern',
   'team', null, 6,
   'we keep building through maya at the 6',
   'The team consistently builds play through Maya at number 6.',
   array['build_up','number_6'], 'neutral', 'build_up'),
  -- right after full time
  (:'match_event_id', :'coach_id', :'team_id', 'post_event', null, null, 'voice_note', 'team_observation',
   'team', null, null,
   'really pleased we stayed calm on the ball even when they pressed',
   'Pleased with how calm we stayed on the ball under their press.',
   array['composure','build_up'], 'positive', null);

-- =============================================================================
-- Reflection on the training session — with the "hoped to see" loop closed
-- =============================================================================

insert into public.reflections
  (id, event_id, user_id, reflection_type, raw_transcript, summary, enriched_summary,
   what_went_well, what_did_not_work, learning_evidence, action_points, suggested_next_focus,
   hoped_to_see_review)
values (
  :'reflection_id', :'training_event_id', :'coach_id', 'coach',
  'good session overall, scanning was there early but it got loose in the middle third',
  'A positive session for build-up: scanning was consistent early, though organisation dropped in the middle third under fatigue.',
  'A positive session for build-up: scanning was consistent early (Oscar a clear example). Organisation dropped in the middle third under fatigue — the constraints were too loose, which is what made it chaotic.',
  '["Build-up patience improved in the first block","Oscar''s scanning consistent all session"]'::jsonb,
  '["Middle-third organisation broke down under fatigue"]'::jsonb,
  '["Oscar scans before receiving (5'')","Jay beats his marker 1v1 (31'')"]'::jsonb,
  '["Tighten constraints in the middle block"]'::jsonb,
  '["Receiving on the half-turn under pressure"]'::jsonb,
  -- Each thing the coach hoped to see, checked against the live notes:
  '[
    {"item":"Players scanning before they receive","status":"showed_up","evidence":"Oscar scans before receiving (5'')"},
    {"item":"Centre-backs splitting to create angles","status":"not_observed","evidence":""},
    {"item":"Keeper used as a spare man","status":"not_observed","evidence":""},
    {"item":"Calm decisions under pressure","status":"partly","evidence":"Middle third became chaotic under fatigue"}
  ]'::jsonb
)
on conflict (id) do nothing;

-- A gap becomes a gentle "why wasn't this seen?" follow-up (skippable) ---------
insert into public.followup_questions (id, reflection_id, question_text, question_type, options)
values (
  :'question_id', :'reflection_id',
  'You hoped to see “Centre-backs splitting to create angles”, but none of your notes touched on it — did it not come up, or did you not get a chance to look?',
  'text', '[]'::jsonb
)
on conflict (id) do nothing;

insert into public.followup_answers (id, question_id, answer_text)
values (
  '99999999-9999-9999-9999-999999999901', :'question_id',
  'We changed the drill before I got to the back-line work, so I never looked at it.'
)
on conflict (id) do nothing;

-- =============================================================================
-- Insights — trends the notes have surfaced, with reflective prompts
-- =============================================================================

insert into public.insights
  (user_id, club_id, team_id, player_id, insight_type, title, description,
   sentiment, reflective_prompt, evidence_count, confidence_score)
values
  (:'coach_id', :'club_id', :'team_id', :'player_oscar', 'player_pattern',
   'Oscar: “scanning”',
   'Noted in 3 of the last 4 weeks (5 notes in total).',
   'positive',
   'Oscar — “scanning” has shown up in 3 of the last 4 weeks. What have you done to let them know they''ve progressed?',
   5, 0.750),
  (:'coach_id', :'club_id', :'team_id', null, 'recurring_theme',
   'Theme: “middle-third organisation”',
   'Noted in 3 of the last 4 weeks (4 notes in total).',
   'concern',
   'The team — “middle-third organisation” has come up in 3 of the last 4 weeks. How do you plan to tackle it?',
   4, 0.750)
on conflict (id) do nothing;

-- =============================================================================
-- Reports — a per-match report and a monthly (period) report
-- =============================================================================

insert into public.reports
  (event_id, team_id, created_by, report_type, title, content_markdown)
values (
  :'match_event_id', null, :'coach_id', 'match_report',
  'JPL Division 1 vs Barnet Youth — Match Report',
  E'# JPL Division 1 vs Barnet Youth\n\n_A composed 2–0 win, clean sheet held under late pressure._\n\n## What you hoped to see\n- ✓ **Composure playing out from the back** — settled build-up throughout\n- ~ **Midfield finding space between lines** — Maya influential at the 6\n\n## Standouts\n- Oscar — goal + assist, man of the match\n- Maya — clean sheet, controlled the base of midfield'
)
on conflict (id) do nothing;

insert into public.reports
  (event_id, team_id, created_by, report_type, title, period_start, period_end, content_markdown)
values (
  null, :'team_id', :'coach_id', 'monthly_report',
  'U15 JPL — Monthly Report (June)',
  '2026-06-01', '2026-06-30',
  E'# U15 JPL — Monthly Report (June)\n\n**Record:** 1W 0D 0L · 2–0 goals\n\n## Themes this month\n- Building out under pressure has become a throughline across sessions\n- Scanning before receiving showing up consistently (Oscar)\n\n## Training ↔ match\n- Build-up work from training carried into the match (composed playing out, Maya at the 6)\n- Middle-third organisation flagged in training didn''t recur in the match — worth watching\n\n## Focus ahead\n- Middle-third organisation under fatigue\n- Receiving on the half-turn under pressure'
)
on conflict (id) do nothing;

-- =============================================================================
-- Player Mode — a standalone player, entirely independent of the coach
-- (their own event + private reflection; not linked to any roster / club / team)
-- =============================================================================
\set player_user_id       '11111111-1111-1111-1111-111111111112'
\set player_event_id      '55555555-5555-5555-5555-555555555503'
\set player_reflection_id '77777777-7777-7777-7777-777777777702'

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (:'player_user_id', 'player@reflective.test',
        '{"full_name":"Jordan Blake","role":"player"}'::jsonb, now(), now())
on conflict (id) do nothing;

-- The player's own reflection event — no club, no team, no coach.
insert into public.events (id, user_id, event_type, title, event_date, status)
values (:'player_event_id', :'player_user_id', 'player_reflection',
        'My game — Saturday', '2026-06-21', 'completed')
on conflict (id) do nothing;

-- A private player reflection (owned by the player → only they can see it).
insert into public.reflections
  (id, event_id, user_id, reflection_type, raw_transcript, summary,
   what_went_well, what_did_not_work, action_points)
values (
  :'player_reflection_id', :'player_event_id', :'player_user_id', 'player',
  'felt sharp today, first touch was good and i kept getting on the ball to start attacks. lost concentration a bit near the end when we were chasing it',
  'Felt sharp — good first touch and got on the ball a lot to start attacks; concentration dipped late on.',
  '["Good first touch under pressure","Got on the ball to start attacks"]'::jsonb,
  '["Concentration dipped late in the game"]'::jsonb,
  '["Stay switched on in the closing spell"]'::jsonb
)
on conflict (id) do nothing;

-- The player's own game log for that reflection (position, role, match details).
insert into public.player_game_log
  (event_id, user_id, positions, role, home_away, opposition,
   goals_for, goals_against, minutes_played, my_goals, my_assists)
values (
  :'player_event_id', :'player_user_id', array['CM'], 'started', 'away', 'Riverside U15',
  1, 2, 90, 0, 1
)
on conflict (event_id) do nothing;
