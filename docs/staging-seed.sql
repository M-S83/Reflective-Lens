-- =============================================================================
-- staging-seed.sql — one realistic end-to-end coach scenario for the staging run.
-- Run this in the staging Supabase SQL editor AFTER you have signed up as the
-- coach in the app (so an auth user + profile exist). Set the email below to the
-- account you signed up with. Idempotent-ish: it removes its own club first, so
-- you can re-run it. It seeds NO reports/questions from the AI - you generate
-- those in the run so you can eyeball real model output.
--
-- The scenario is built to exercise exactly what changed this pass:
--   * an aim that has NO matching note (so the aim-aware checklist must show it
--     as "stated, not recorded", kept not dropped)  -> F4
--   * plain coach notes only (so you can check the report invents nothing)  -> F4
--   * a U12 team with TWO players called "Jack" (so first-name-only must
--     disambiguate to "Jack S" / "Jack B", no surnames)  -> under-18 rule
--   * a training event AND a match event in the same month, sharing themes, so
--     the monthly period report has real cross-context signal to summarise  -> F25
-- =============================================================================

do $$
declare
  v_email  text := '<YOUR_COACH_EMAIL>';   -- <<< EDIT ME
  v_uid    uuid;
  v_club   uuid := gen_random_uuid();
  v_team   uuid := gen_random_uuid();
  v_jacks  uuid := gen_random_uuid();       -- Jack Smith (#9)
  v_jackb  uuid := gen_random_uuid();       -- Jack Brown (#10)
  v_oscar  uuid := gen_random_uuid();       -- Oscar Ade (#7)
  v_leo    uuid := gen_random_uuid();       -- Leo Fenn (#11)
  v_amara  uuid := gen_random_uuid();       -- Amara Diallo (#4)
  v_sub    uuid := gen_random_uuid();       -- Noah Pryce (#14), game changer
  v_train  uuid := gen_random_uuid();       -- training event
  v_match  uuid := gen_random_uuid();       -- match event
  v_ref_t  uuid;                            -- training reflection
  v_ref_m  uuid;                            -- match reflection
  v_q      uuid;
begin
  select id into v_uid from auth.users where email = v_email;
  if v_uid is null then
    raise exception 'No auth user for %. Sign up in the app first, then set v_email.', v_email;
  end if;

  -- Clean any prior run of this scenario (by club name), then reseed.
  delete from public.clubs where created_by = v_uid and name = 'Riverside Rovers';

  insert into public.clubs (id, name, created_by) values (v_club, 'Riverside Rovers', v_uid);
  insert into public.teams (id, club_id, name, age_group, format, created_by)
    values (v_team, v_club, 'U12 Lions', 'U12', '9v9', v_uid);

  insert into public.players (id, team_id, first_name, last_name, display_name, shirt_number, position, created_by) values
    (v_jacks, v_team, 'Jack',  'Smith',  'Jack Smith',  9,  'ST', v_uid),
    (v_jackb, v_team, 'Jack',  'Brown',  'Jack Brown',  10, 'CM', v_uid),
    (v_oscar, v_team, 'Oscar', 'Ade',    'Oscar Ade',   7,  'RB', v_uid),
    (v_leo,   v_team, 'Leo',   'Fenn',   'Leo Fenn',    11, 'LW', v_uid),
    (v_amara, v_team, 'Amara', 'Diallo', 'Amara Diallo',4,  'CB', v_uid),
    (v_sub,   v_team, 'Noah',  'Pryce',  'Noah Pryce',  14, 'CM', v_uid);

  -- ---- TRAINING (2026-07-07): playing out from the back --------------------
  insert into public.events (id, user_id, club_id, team_id, event_type, title, event_date,
                             focus_area, purpose, hoping_to_see, status)
  values (v_train, v_uid, v_club, v_team, 'training_session', 'Tuesday training', date '2026-07-07',
    'Playing out from the back',
    'Build confidence keeping the ball under pressure near our own goal',
    -- NOTE: the third aim (scanning) has NO matching note below, on purpose.
    '["The keeper starts moves calmly","Full-backs get wide to receive","Players scan before they receive"]'::jsonb,
    'completed');

  insert into public.observations (event_id, user_id, team_id, capture_phase, input_type,
                                   observation_type, subject_type, raw_note, cleaned_note, tags, sentiment)
  values
    (v_train, v_uid, v_team, 'live', 'text_note', 'team_observation', 'team',
     'Keeper took his time on the goal kicks and found a full-back most times',
     'Keeper took his time on the goal kicks and found a full-back most times',
     ARRAY['playing_out','goalkeeping'], 'positive'),
    (v_train, v_uid, v_team, 'live', 'text_note', 'team_observation', 'team',
     'Number 2 got wide well on the right, the left side stayed narrow',
     'Number 2 got wide well on the right, the left side stayed narrow',
     ARRAY['width'], 'neutral'),
    (v_train, v_uid, v_team, 'live', 'text_note', 'team_observation', 'team',
     'A couple of times they turned into pressure near their own box',
     'A couple of times they turned into pressure near their own box',
     ARRAY['playing_out','under_pressure'], 'concern');

  insert into public.reflections (id, event_id, user_id, reflection_type, raw_transcript, summary)
  values (gen_random_uuid(), v_train, v_uid, 'coach',
    'Better than last week keeping the ball at the back. The right side looked calm, the left needs work. I want to sort the timing of the first pass.',
    'Better than last week keeping the ball at the back. The right side looked calm, the left needs work. I want to sort the timing of the first pass.')
  returning id into v_ref_t;

  insert into public.followup_questions (id, reflection_id, question_text, question_type)
  values (gen_random_uuid(), v_ref_t,
    'When they turned into pressure, which players and which moment was it?', 'text')
  returning id into v_q;
  insert into public.followup_answers (question_id, answer_text)
  values (v_q, 'Mostly the two centre-backs when their winger pressed them, in the second half.');

  -- ---- MATCH (2026-07-14): does it carry into a game? ----------------------
  insert into public.events (id, user_id, club_id, team_id, event_type, title, event_date,
                             opposition, focus_area, purpose, hoping_to_see, status)
  values (v_match, v_uid, v_club, v_team, 'match', 'vs Hillside Colts', date '2026-07-14',
    'Hillside Colts', 'Playing out under a high press',
    'See if the training carries into a game',
    '["We play out rather than kick long when pressed","Full-backs offer width","We stay compact when we lose it"]'::jsonb,
    'completed');

  insert into public.observations (event_id, user_id, team_id, capture_phase, input_type,
                                   observation_type, subject_type, raw_note, cleaned_note, tags, sentiment)
  values
    (v_match, v_uid, v_team, 'live', 'text_note', 'team_observation', 'team',
     'We played out well in the first half, kept it on the floor',
     'We played out well in the first half, kept it on the floor',
     ARRAY['playing_out'], 'positive'),
    (v_match, v_uid, v_team, 'live', 'text_note', 'team_observation', 'team',
     'When they pressed hard we went long a few times',
     'When they pressed hard we went long a few times',
     ARRAY['playing_out','under_pressure'], 'concern'),
    (v_match, v_uid, v_team, 'live', 'text_note', 'team_observation', 'team',
     'A gap opened between midfield and defence after we lost it',
     'A gap opened between midfield and defence after we lost it',
     ARRAY['compactness','transition'], 'concern');

  insert into public.reflections (id, event_id, user_id, reflection_type, raw_transcript, summary)
  values (gen_random_uuid(), v_match, v_uid, 'coach',
    'Pleased we tried to play out even under pressure. We got stretched when we lost it. The build-up led to both goals.',
    'Pleased we tried to play out even under pressure. We got stretched when we lost it. The build-up led to both goals.')
  returning id into v_ref_m;

  insert into public.followup_questions (id, reflection_id, question_text, question_type)
  values (gen_random_uuid(), v_ref_m,
    'When you went long under pressure, what were the players seeing?', 'text')
  returning id into v_q;
  insert into public.followup_answers (question_id, answer_text)
  values (v_q, 'They panicked a bit, it was the first game really trying to play out for real.');

  -- Match result, squad and stats (drives the period report record + highlights).
  insert into public.match_details (event_id, home_away, formation, goals_for, goals_against, man_of_the_match)
  values (v_match, 'home', '3-2-3', 2, 1, v_jacks);

  insert into public.event_attendance (event_id, player_id, status, selection) values
    (v_match, v_jacks, 'present', 'starter'),
    (v_match, v_jackb, 'present', 'starter'),
    (v_match, v_oscar, 'present', 'starter'),
    (v_match, v_leo,   'present', 'starter'),
    (v_match, v_amara, 'present', 'starter'),
    (v_match, v_sub,   'present', 'substitute');   -- game changer

  insert into public.match_stats (event_id, player_id, goals, assists, clean_sheet) values
    (v_match, v_jacks, 2, 0, false),   -- both Jacks appear -> "Jack S" / "Jack B" in the report
    (v_match, v_jackb, 0, 1, false),
    (v_match, v_oscar, 0, 1, false);

  raise notice 'Seeded. training event=% match event=% team=%', v_train, v_match, v_team;
end $$;

-- After running, fetch the ids you will need for the run:
--   select id, event_type, title, event_date from public.events
--     where team_id in (select id from public.teams where name = 'U12 Lions')
--     order by event_date;
--   select id, name from public.teams where name = 'U12 Lions';
