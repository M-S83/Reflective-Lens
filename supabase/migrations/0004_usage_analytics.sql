-- =============================================================================
-- 0004_usage_analytics.sql
-- Usage analytics + monetisation.
--
-- Two jobs:
--   1. USAGE ANALYTICS — one append-only `usage_events` table records every
--      meaningful action: AI calls (with token cost), transcriptions (with audio
--      cost), and engagement events written automatically by triggers. Admin-only
--      analytics views roll it up (active users, feature usage, cost per user).
--   2. MONETISATION — `plans` + `subscriptions` describe what a user pays and
--      what they're entitled to. A billing webhook (edge function) keeps
--      subscriptions in sync with the payment provider; has_active_subscription()
--      gates paid features.
--
-- Cost is computed at the point of use (see functions/_shared/clients.ts) and
-- stored per event, so the dashboard never has to re-derive provider prices.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- is_admin() — true when the current user's profile role is 'admin'. Gates the
-- analytics views (which otherwise bypass RLS to aggregate across everyone) and
-- management of the billing catalogue.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- =============================================================================
-- USAGE EVENTS — append-only activity + cost log.
-- =============================================================================
create table public.usage_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  event_name    text not null,          -- 'ai_call' | 'transcription' | 'reflection_created' | ...
  feature       text,                   -- which function/feature produced it
  model         text,                   -- Claude model id, for ai_call
  input_tokens  integer,
  output_tokens integer,
  audio_seconds integer,                -- for transcription
  cost_usd      numeric(12,6) not null default 0,   -- provider cost of THIS event
  club_id       uuid references public.clubs(id) on delete set null,
  team_id       uuid references public.teams(id) on delete set null,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index usage_events_user_time_idx on public.usage_events (user_id, created_at desc);
create index usage_events_time_idx       on public.usage_events (created_at desc);
create index usage_events_name_idx       on public.usage_events (event_name);
create index usage_events_feature_idx    on public.usage_events (feature);

alter table public.usage_events enable row level security;

-- A user sees their own usage; admins see everyone's.
create policy "usage_events: read own or admin" on public.usage_events for select
  using (user_id = auth.uid() or public.is_admin());

-- Clients may log their own engagement events (e.g. pdf_export). Server-side
-- cost logging uses the service role and bypasses RLS.
create policy "usage_events: insert own" on public.usage_events for insert
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- track_usage() — generic AFTER INSERT trigger that logs an engagement event.
--   TG_ARGV[0] = event_name, TG_ARGV[1] = the column holding the user id.
-- SECURITY DEFINER so it always writes the tracking row, whatever RLS says.
-- Optional columns (club_id/team_id/*_type) are read only if present — `->>` on
-- a missing jsonb key returns NULL, so this works across differently-shaped rows.
-- -----------------------------------------------------------------------------
create or replace function public.track_usage()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  rec jsonb := to_jsonb(NEW);
  uid uuid  := (rec ->> TG_ARGV[1])::uuid;
begin
  if uid is null then
    return NEW;
  end if;
  insert into public.usage_events (user_id, event_name, feature, club_id, team_id, metadata)
  values (
    uid,
    TG_ARGV[0],
    TG_ARGV[0],
    (rec ->> 'club_id')::uuid,
    (rec ->> 'team_id')::uuid,
    jsonb_strip_nulls(jsonb_build_object(
      'event_type',      rec ->> 'event_type',
      'report_type',     rec ->> 'report_type',
      'input_type',      rec ->> 'input_type',
      'reflection_type', rec ->> 'reflection_type'
    ))
  );
  return NEW;
end;
$$;

create trigger trk_event_created after insert on public.events
  for each row execute function public.track_usage('event_created', 'user_id');
create trigger trk_observation_created after insert on public.observations
  for each row execute function public.track_usage('observation_created', 'user_id');
create trigger trk_reflection_created after insert on public.reflections
  for each row execute function public.track_usage('reflection_created', 'user_id');
create trigger trk_report_generated after insert on public.reports
  for each row execute function public.track_usage('report_generated', 'created_by');
create trigger trk_player_game_logged after insert on public.player_game_log
  for each row execute function public.track_usage('player_game_logged', 'user_id');

-- =============================================================================
-- PLANS — the products a user can be on. Prices in minor units (pence).
-- =============================================================================
create table public.plans (
  id            text primary key,        -- 'free' | 'coach_monthly' | ...
  name          text not null,
  description   text,
  price_pence   integer not null default 0,
  currency      text not null default 'gbp',
  interval      text not null default 'month',  -- 'month' | 'season' | 'once' | 'free'
  ai_budget_usd numeric(10,2),           -- soft monthly AI-cost ceiling, for margin monitoring
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  features      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- =============================================================================
-- SUBSCRIPTIONS — a user's current plan + billing status (mirror of Stripe).
-- One row per user; the billing webhook keeps it in sync.
-- =============================================================================
create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  plan_id                text not null references public.plans(id),
  status                 text not null default 'trialing',  -- trialing|active|past_due|canceled|incomplete
  stripe_customer_id     text,
  stripe_subscription_id text,
  trial_ends_at          timestamptz,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id)
);

create index subscriptions_status_idx on public.subscriptions (status);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- has_active_subscription() — true if the user has a usable paid entitlement
-- (active, or still within an unexpired trial). Gate paid features on this.
create or replace function public.has_active_subscription(target uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = target
      and (
        s.status = 'active'
        or (s.status = 'trialing' and coalesce(s.trial_ends_at, now()) >= now())
      )
  );
$$;

alter table public.plans         enable row level security;
alter table public.subscriptions enable row level security;

-- Plans are a public catalogue for signed-in users; only admins manage them.
create policy "plans: read active" on public.plans for select
  using (is_active or public.is_admin());
create policy "plans: admin manage" on public.plans for all
  using (public.is_admin()) with check (public.is_admin());

-- A user sees their own subscription; admins see all. Writes go through the
-- billing webhook (service role) — clients never set their own paid status.
create policy "subscriptions: read own or admin" on public.subscriptions for select
  using (user_id = auth.uid() or public.is_admin());
create policy "subscriptions: admin manage" on public.subscriptions for all
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- ANALYTICS VIEWS (admin only)
-- These run as the view owner and so read across ALL users' usage_events; the
-- is_admin() guard in each definition means a non-admin caller gets zero rows.
-- =============================================================================

-- Headline snapshot for the top of the dashboard (single row).
create view public.analytics_overview as
  select
    (select count(*) from public.profiles)                                            as total_users,
    (select count(distinct user_id) from public.usage_events
       where created_at >= now() - interval '7 days')                                 as active_7d,
    (select count(distinct user_id) from public.usage_events
       where created_at >= now() - interval '30 days')                                as active_30d,
    (select round(coalesce(sum(cost_usd), 0), 2) from public.usage_events
       where created_at >= now() - interval '30 days')                                as cost_30d_usd,
    (select count(*) from public.usage_events
       where event_name = 'reflection_created'
         and created_at >= now() - interval '30 days')                                as reflections_30d,
    (select count(*) from public.usage_events
       where event_name = 'report_generated'
         and created_at >= now() - interval '30 days')                                as reports_30d,
    (select count(*) from public.subscriptions where status in ('active', 'trialing')) as paying_or_trialing
  where public.is_admin();

-- Daily activity: distinct active users + event volume.
create view public.analytics_daily_active_users as
  select
    date_trunc('day', created_at)::date as day,
    count(distinct user_id)             as active_users,
    count(*)                            as events
  from public.usage_events
  where public.is_admin()
  group by 1
  order by 1 desc;

-- Feature usage + what each feature costs to run.
create view public.analytics_feature_usage as
  select
    coalesce(feature, event_name) as feature,
    count(*)                      as uses,
    count(distinct user_id)       as users,
    round(sum(cost_usd), 4)       as cost_usd,
    sum(input_tokens)             as input_tokens,
    sum(output_tokens)            as output_tokens
  from public.usage_events
  where public.is_admin()
  group by 1
  order by uses desc;

-- Per-user cost per month (the money question, per user).
create view public.analytics_user_cost_monthly as
  select
    user_id,
    date_trunc('month', created_at)::date          as month,
    count(*) filter (where event_name = 'ai_call') as ai_calls,
    round(coalesce(sum(audio_seconds), 0) / 60.0, 1) as audio_minutes,
    round(sum(cost_usd), 4)                        as cost_usd
  from public.usage_events
  where public.is_admin()
  group by 1, 2
  order by month desc, cost_usd desc;

-- Daily provider cost split (AI text vs transcription).
create view public.analytics_cost_daily as
  select
    date_trunc('day', created_at)::date                                 as day,
    round(sum(cost_usd) filter (where event_name = 'ai_call'), 4)       as ai_cost_usd,
    round(sum(cost_usd) filter (where event_name = 'transcription'), 4) as transcription_cost_usd,
    round(sum(cost_usd), 4)                                             as total_cost_usd
  from public.usage_events
  where public.is_admin()
  group by 1
  order by 1 desc;

-- Monthly recurring revenue from active subscriptions, normalised to a month.
create view public.analytics_mrr as
  select
    round(sum(
      case p.interval
        when 'month'  then p.price_pence
        when 'season' then p.price_pence / 9.0   -- a season ≈ 9 months (Aug–May)
        else 0
      end
    ) / 100.0, 2) as mrr_gbp,
    count(*)       as active_subscriptions
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.status = 'active' and public.is_admin();

-- =============================================================================
-- SEED — the initial plan catalogue (grassroots pricing, GBP).
-- ai_budget_usd is the soft monthly provider-cost ceiling used to watch margin
-- (see docs/cost-model.md for how these were derived).
-- =============================================================================
insert into public.plans (id, name, description, price_pence, currency, interval, ai_budget_usd, sort_order, features) values
  ('free',           'Free',             '14-day trial, then read-only',                  0,    'gbp', 'free',   1.00,  0, '{"trial_days":14}'),
  ('coach_monthly',  'Coach — Monthly',  'One coach, unlimited teams',                    799,  'gbp', 'month',  3.00,  1, '{"role":"coach","teams":"unlimited"}'),
  ('coach_season',   'Coach — Season',   'One coach, full season up front (save ~30%)',   5999, 'gbp', 'season', 3.00,  2, '{"role":"coach","teams":"unlimited"}'),
  ('player_monthly', 'Player — Monthly', 'One player, all their teams',                   299,  'gbp', 'month',  0.75,  3, '{"role":"player"}'),
  ('player_season',  'Player — Season',  'One player, full season up front',              1999, 'gbp', 'season', 0.75,  4, '{"role":"player"}'),
  ('club',           'Club',             'Multiple coaches under one club',               2499, 'gbp', 'month',  12.00, 5, '{"role":"coach","seats":"multi"}')
on conflict (id) do nothing;

-- =============================================================================
-- GRANTS — new objects need base privileges (RLS still restricts rows).
-- =============================================================================
grant select, insert, update, delete on public.usage_events  to authenticated;
grant select, insert, update, delete on public.plans         to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;

grant select on public.analytics_overview            to authenticated;
grant select on public.analytics_daily_active_users  to authenticated;
grant select on public.analytics_feature_usage       to authenticated;
grant select on public.analytics_user_cost_monthly   to authenticated;
grant select on public.analytics_cost_daily          to authenticated;
grant select on public.analytics_mrr                 to authenticated;

grant execute on function public.is_admin()                    to anon, authenticated;
grant execute on function public.has_active_subscription(uuid) to anon, authenticated;
