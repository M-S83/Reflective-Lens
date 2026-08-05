-- =============================================================================
-- 0019_feedback_beta_analytics.sql — hearing from beta testers, and seeing what
-- they actually do.
--
-- Two gaps this closes before handing the app to testers.
--
-- 1. THERE WAS NO WAY TO TELL YOU ANYTHING. A tester who hit a problem had to
--    remember it and mention it later, which means most of it is never heard.
--    feedback is a direct line from inside the app, capturing the screen they
--    were on so a vague "this bit was confusing" is still actionable.
--
-- 2. THE DASHBOARD MEASURED COST, NOT BEHAVIOUR. analytics_feature_usage (0004)
--    is derived from usage_events, so it only sees things that cost money: an
--    AI call. A tester who opened a screen, gave up and left registered as
--    nothing at all. feature_events (0017) records that, and until now nothing
--    read it. During a beta, "twelve people opened the glossary and two used it"
--    is the more useful sentence.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FEEDBACK — what a tester wants to tell you.
--
-- kind is deliberately loose (a text column, not an enum): what testers want to
-- say is exactly the thing you cannot predict, and an enum here would need a
-- migration every time. status is the owner's triage state.
-- -----------------------------------------------------------------------------
create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null default 'suggestion',   -- suggestion | issue | confusing | praise | other
  message    text not null,
  -- Where they were and what they were on, so a report can be reproduced.
  -- Set by the client: path, app version, user agent. Never anything they did
  -- not type plus the page they were on.
  context    jsonb not null default '{}'::jsonb,
  status     text not null default 'new',          -- new | seen | actioned | closed
  owner_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feedback_created_idx on public.feedback (created_at desc);
create index feedback_status_idx on public.feedback (status);
create index feedback_user_idx on public.feedback (user_id);

alter table public.feedback enable row level security;

create trigger feedback_set_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

-- A tester writes their own and can see what they sent (so the app can say
-- "thanks, here is what you have told us"). They cannot read anyone else's, and
-- cannot edit or delete once sent: feedback is a record, not a draft.
create policy "feedback: insert own" on public.feedback for insert
  with check (user_id = auth.uid());
create policy "feedback: read own or admin" on public.feedback for select
  using (user_id = auth.uid() or public.is_admin());
-- Only the owner triages. Deliberately no delete policy for anyone: nothing
-- silently disappears from the record.
create policy "feedback: admin triages" on public.feedback for update
  using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- BETA ANALYTICS. Same shape as 0004: plain views, each gated by is_admin()
-- INSIDE the view, because a view has no RLS of its own and would otherwise run
-- with its owner's rights and expose everyone's rows. A non-admin selecting
-- these gets no rows rather than an error.
-- -----------------------------------------------------------------------------

-- What gets used, and by how many people. The count of distinct users is the
-- number that matters in a beta: one enthusiast can make a feature look adopted.
create view public.analytics_feature_adoption as
  select
    feature,
    action,
    count(*)                as uses,
    count(distinct user_id) as users,
    max(created_at)         as last_used
  from public.feature_events
  where public.is_admin()
  group by 1, 2
  order by users desc, uses desc;

-- Daily activity from the client's point of view, which includes the sessions
-- that cost nothing. Pairs with analytics_daily_active_users (0004), which can
-- only see days somebody spent money.
create view public.analytics_feature_daily as
  select
    date_trunc('day', created_at)::date as day,
    count(*)                            as events,
    count(distinct user_id)             as users
  from public.feature_events
  where public.is_admin()
  group by 1
  order by 1 desc;

-- The funnel before sign-up. visitor_id counts visits, it does not follow a
-- person (see 0017).
create view public.analytics_landing as
  select
    event,
    count(*)                   as hits,
    count(distinct visitor_id) as visitors,
    max(created_at)            as last_seen
  from public.landing_events
  where public.is_admin()
  group by 1
  order by hits desc;

-- Feedback at a glance, so the dashboard can show "4 new" without pulling every
-- message body.
create view public.analytics_feedback_summary as
  select
    kind,
    status,
    count(*)        as count,
    max(created_at) as latest
  from public.feedback
  where public.is_admin()
  group by 1, 2
  order by count desc;

grant select on public.analytics_feature_adoption to authenticated;
grant select on public.analytics_feature_daily    to authenticated;
grant select on public.analytics_landing          to authenticated;
grant select on public.analytics_feedback_summary to authenticated;
