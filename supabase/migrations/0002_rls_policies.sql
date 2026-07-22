-- =============================================================================
-- 0002_rls_policies.sql
-- Row Level Security for all tables.
--
-- Model at this stage: OWNERSHIP-ONLY. Each user sees and edits only what they
-- created. There is no in-app sharing between users — if someone needs to share
-- a report, they export a PDF and send it themselves.
--
-- A happy consequence: because access is purely by ownership, one person can own
-- MANY clubs and teams (a coach at two clubs, a player at two teams) and reflect
-- on each individually — nothing is tied to a single "home" club.
--
-- (The `report_access` grant table is kept, dormant, so per-report in-app sharing
--  can be switched on later without a migration.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER to avoid recursive RLS lookups)
-- -----------------------------------------------------------------------------

-- Can the current user access a given event? (owner only)
create or replace function public.can_access_event(target_event uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event and e.user_id = auth.uid()
  );
$$;

-- Can the current user access a given report? (creator, or an explicit grant)
create or replace function public.can_access_report(target_report uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.reports r
    where r.id = target_report
      and (
        r.created_by = auth.uid()
        or exists (
          select 1 from public.report_access ra
          where ra.report_id = r.id and ra.user_id = auth.uid()
        )
      )
  );
$$;

-- =============================================================================
-- Enable RLS on every table
-- =============================================================================

alter table public.clubs               enable row level security;
alter table public.profiles            enable row level security;
alter table public.teams               enable row level security;
alter table public.players             enable row level security;
alter table public.player_development_notes enable row level security;
alter table public.coach_voice_profiles enable row level security;
alter table public.competitions        enable row level security;
alter table public.events              enable row level security;
alter table public.event_attendance    enable row level security;
alter table public.match_details       enable row level security;
alter table public.match_stats         enable row level security;
alter table public.team_sheets         enable row level security;
alter table public.team_sheet_players  enable row level security;
alter table public.observations        enable row level security;
alter table public.player_game_log     enable row level security;
alter table public.reflections         enable row level security;
alter table public.followup_questions  enable row level security;
alter table public.followup_answers    enable row level security;
alter table public.reports             enable row level security;
alter table public.report_access       enable row level security;
alter table public.insights            enable row level security;

-- =============================================================================
-- PROFILES — a user sees and edits only their own profile.
-- =============================================================================

create policy "profiles: read self"
  on public.profiles for select using (id = auth.uid());

create policy "profiles: insert self"
  on public.profiles for insert with check (id = auth.uid());

create policy "profiles: update self"
  on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- =============================================================================
-- OWNED ORG ENTITIES — clubs, teams, competitions, players (own-only).
-- A user can create as many clubs/teams as they like.
-- =============================================================================

create policy "clubs: own" on public.clubs for all
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "teams: own" on public.teams for all
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "competitions: own" on public.competitions for all
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "players: own" on public.players for all
  using (created_by = auth.uid()) with check (created_by = auth.uid());

-- =============================================================================
-- PLAYER DEVELOPMENT NOTES — author only.
-- =============================================================================

create policy "player_dev_notes: own" on public.player_development_notes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- COACH VOICE PROFILES — each user owns their own.
-- =============================================================================

create policy "voice_profile: read own" on public.coach_voice_profiles for select
  using (user_id = auth.uid());
create policy "voice_profile: insert own" on public.coach_voice_profiles for insert
  with check (user_id = auth.uid());
create policy "voice_profile: update own" on public.coach_voice_profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- EVENTS — the creator only.
-- =============================================================================

create policy "events: own" on public.events for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- EVENT-SCOPED CHILD TABLES — access follows the parent event's owner.
-- =============================================================================

create policy "team_sheets: access via event" on public.team_sheets for all
  using (public.can_access_event(event_id))
  with check (public.can_access_event(event_id));

create policy "team_sheet_players: access via team sheet" on public.team_sheet_players for all
  using (exists (select 1 from public.team_sheets ts
    where ts.id = team_sheet_players.team_sheet_id and public.can_access_event(ts.event_id)))
  with check (exists (select 1 from public.team_sheets ts
    where ts.id = team_sheet_players.team_sheet_id and public.can_access_event(ts.event_id)));

-- Owner always has access (covers ad-hoc notes with no event).
create policy "observations: access own or via event" on public.observations for all
  using (user_id = auth.uid() or (event_id is not null and public.can_access_event(event_id)))
  with check (user_id = auth.uid() or (event_id is not null and public.can_access_event(event_id)));

create policy "event_attendance: access via event" on public.event_attendance for all
  using (public.can_access_event(event_id)) with check (public.can_access_event(event_id));

create policy "match_details: access via event" on public.match_details for all
  using (public.can_access_event(event_id)) with check (public.can_access_event(event_id));

create policy "match_stats: access via event" on public.match_stats for all
  using (public.can_access_event(event_id)) with check (public.can_access_event(event_id));

-- =============================================================================
-- PLAYER GAME LOG (Player Mode) — private to the player who logged it.
-- =============================================================================

create policy "player_game_log: own only" on public.player_game_log for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- REFLECTIONS — author only (coach and player reflections are both private).
-- =============================================================================

create policy "reflections: own" on public.reflections for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- FOLLOW-UP QUESTIONS & ANSWERS — scoped to the reflection's owner.
-- =============================================================================

create policy "followup_questions: via reflection owner" on public.followup_questions for all
  using (exists (select 1 from public.reflections r
    where r.id = followup_questions.reflection_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.reflections r
    where r.id = followup_questions.reflection_id and r.user_id = auth.uid()));

create policy "followup_answers: via reflection owner" on public.followup_answers for all
  using (exists (select 1 from public.followup_questions q
    join public.reflections r on r.id = q.reflection_id
    where q.id = followup_answers.question_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.followup_questions q
    join public.reflections r on r.id = q.reflection_id
    where q.id = followup_answers.question_id and r.user_id = auth.uid()));

-- =============================================================================
-- REPORTS — creator only (plus dormant per-report grants for future sharing).
-- =============================================================================

create policy "reports: read" on public.reports for select
  using (public.can_access_report(id));

-- A report is per-event (owns the event), a team period report (owns the team),
-- or a personal player summary (no event, no team).
create policy "reports: insert own" on public.reports for insert
  with check (
    created_by = auth.uid()
    and (
      (event_id is not null and public.can_access_event(event_id))
      or (event_id is null and team_id is not null and exists (
        select 1 from public.teams t where t.id = reports.team_id and t.created_by = auth.uid()
      ))
      or (event_id is null and team_id is null)
    )
  );

create policy "reports: update by creator" on public.reports for update
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "reports: delete by creator" on public.reports for delete
  using (created_by = auth.uid());

-- report_access (dormant sharing mechanism) — managed by the report owner.
create policy "report_access: read own or report owner" on public.report_access for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.reports r where r.id = report_access.report_id and r.created_by = auth.uid())
  );

create policy "report_access: manage by report owner" on public.report_access for all
  using (exists (select 1 from public.reports r where r.id = report_access.report_id and r.created_by = auth.uid()))
  with check (granted_by = auth.uid()
    and exists (select 1 from public.reports r where r.id = report_access.report_id and r.created_by = auth.uid()));

-- =============================================================================
-- INSIGHTS — owned by the user who generated them.
-- =============================================================================

create policy "insights: read own" on public.insights for select
  using (user_id = auth.uid());
create policy "insights: insert own" on public.insights for insert
  with check (user_id = auth.uid());
create policy "insights: update own" on public.insights for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "insights: delete own" on public.insights for delete
  using (user_id = auth.uid());

-- =============================================================================
-- TABLE-LEVEL GRANTS
-- RLS only *restricts* access; the API roles still need base privileges.
-- =============================================================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;
