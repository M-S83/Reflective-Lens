-- =============================================================================
-- 0005_continuous_learning.sql
-- "The app learns from itself at all times."
--
-- The learning passes (voice profile, insight/trend detection) already exist as
-- edge functions — but they only ran when called. This makes them CONTINUOUS:
--   • every new note / reflection marks the user's learning as "pending" (a
--     trigger, so it happens no matter how the row was created);
--   • a sweep (nightly, and/or on new input) processes only the users who have
--     pending work — cheap, because unchanged users are skipped;
--   • every pass writes a `learning_runs` row, so what the app taught itself is
--     visible (in the dashboard, and to the user).
--
-- The sweep itself is the `run-learning` edge function, invoked by pg_cron — see
-- docs/continuous-learning.md for the one-line schedule.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- learning_state — one row per user: what's waiting to be learned, last runs.
-- `*_pending_since` is non-null when there's new input the app hasn't learned
-- from yet; the sweep clears it and stamps `last_*_run`.
-- -----------------------------------------------------------------------------
create table public.learning_state (
  user_id                uuid primary key references public.profiles(id) on delete cascade,
  voice_pending_since    timestamptz,   -- new writing since the last voice pass
  insights_pending_since timestamptz,   -- new notes since the last insight pass
  last_voice_run         timestamptz,
  last_insights_run      timestamptz,
  updated_at             timestamptz not null default now()
);

-- mark_learning_pending() — trigger fn.
--   TG_ARGV[0] = 'voice' | 'insights' (which learning this input feeds)
--   TG_ARGV[1] = the column on the row holding the user id
-- Keeps the EARLIEST unprocessed timestamp (coalesce), so a burst of notes still
-- points at when the backlog started.
create or replace function public.mark_learning_pending()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;
begin
  if uid is null then
    return NEW;
  end if;
  insert into public.learning_state as ls (user_id, voice_pending_since, insights_pending_since)
  values (
    uid,
    case when TG_ARGV[0] = 'voice'    then now() end,
    case when TG_ARGV[0] = 'insights' then now() end
  )
  on conflict (user_id) do update set
    voice_pending_since = case
      when TG_ARGV[0] = 'voice'    then coalesce(ls.voice_pending_since, now())
      else ls.voice_pending_since end,
    insights_pending_since = case
      when TG_ARGV[0] = 'insights' then coalesce(ls.insights_pending_since, now())
      else ls.insights_pending_since end,
    updated_at = now();
  return NEW;
end;
$$;

-- A note feeds BOTH trend detection (its tags) and voice (its raw words).
create trigger learn_insights_from_observation after insert on public.observations
  for each row execute function public.mark_learning_pending('insights', 'user_id');
create trigger learn_voice_from_observation after insert on public.observations
  for each row execute function public.mark_learning_pending('voice', 'user_id');
-- A reflection feeds voice (its raw transcript is the coach/player's own words).
create trigger learn_voice_from_reflection after insert on public.reflections
  for each row execute function public.mark_learning_pending('voice', 'user_id');

-- -----------------------------------------------------------------------------
-- learning_runs — the visible ledger of what the app taught itself, and when.
-- -----------------------------------------------------------------------------
create table public.learning_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  kind          text not null,          -- 'voice' | 'insights'
  inputs_seen   integer not null default 0,
  items_changed integer not null default 0,  -- insights created, or voice sample_count
  summary       text,                   -- one line: what changed, in plain words
  metadata      jsonb not null default '{}'::jsonb,
  ran_at        timestamptz not null default now()
);
create index learning_runs_user_time_idx on public.learning_runs (user_id, ran_at desc);
create index learning_runs_time_idx       on public.learning_runs (ran_at desc);

-- learning_due() — the users the sweep should process (something pending),
-- oldest backlog first. SECURITY DEFINER; the sweep calls it with the service role.
create or replace function public.learning_due(max_rows integer default 200)
returns table (user_id uuid, need_voice boolean, need_insights boolean)
language sql stable security definer set search_path = public
as $$
  select
    ls.user_id,
    (ls.voice_pending_since is not null)    as need_voice,
    (ls.insights_pending_since is not null) as need_insights
  from public.learning_state ls
  where ls.voice_pending_since is not null
     or ls.insights_pending_since is not null
  order by least(
    coalesce(ls.voice_pending_since,    'infinity'::timestamptz),
    coalesce(ls.insights_pending_since, 'infinity'::timestamptz)
  ) asc
  limit max_rows;
$$;

-- clear_learning_pending() — called by a learning pass once it has processed a
-- user, so the same input isn't re-learned next sweep.
create or replace function public.clear_learning_pending(target uuid, which text)
returns void
language sql security definer set search_path = public
as $$
  insert into public.learning_state as ls (user_id, voice_pending_since, insights_pending_since,
                                            last_voice_run, last_insights_run)
  values (
    target,
    null, null,
    case when which = 'voice'    then now() end,
    case when which = 'insights' then now() end
  )
  on conflict (user_id) do update set
    voice_pending_since    = case when which = 'voice'    then null else ls.voice_pending_since end,
    insights_pending_since = case when which = 'insights' then null else ls.insights_pending_since end,
    last_voice_run         = case when which = 'voice'    then now() else ls.last_voice_run end,
    last_insights_run      = case when which = 'insights' then now() else ls.last_insights_run end,
    updated_at = now();
$$;

alter table public.learning_state enable row level security;
alter table public.learning_runs  enable row level security;

-- A user sees their own learning state + history; admins see everyone's.
create policy "learning_state: read own or admin" on public.learning_state for select
  using (user_id = auth.uid() or public.is_admin());
create policy "learning_runs: read own or admin" on public.learning_runs for select
  using (user_id = auth.uid() or public.is_admin());
create policy "learning_runs: insert own" on public.learning_runs for insert
  with check (user_id = auth.uid());

-- Admin view: what the app has been learning lately (for the dashboard).
create view public.analytics_learning_recent as
  select
    date_trunc('day', ran_at)::date          as day,
    kind,
    count(*)                                  as runs,
    count(distinct user_id)                   as users,
    sum(items_changed)                        as items_changed
  from public.learning_runs
  where public.is_admin()
  group by 1, 2
  order by 1 desc, 2;

-- =============================================================================
-- GRANTS
-- =============================================================================
grant select, insert, update, delete on public.learning_state to authenticated;
grant select, insert, update, delete on public.learning_runs  to authenticated;
grant select on public.analytics_learning_recent to authenticated;
grant execute on function public.learning_due(integer)              to authenticated;
grant execute on function public.clear_learning_pending(uuid, text) to authenticated;
