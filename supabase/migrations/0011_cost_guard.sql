-- =============================================================================
-- 0011_cost_guard.sql — automatic cost guard.
-- When a user's month-to-date AI spend passes their plan's budget, features that
-- have an `over_budget_model` fall back to it (cheaper), while the finished
-- reports stay on the quality model (their over_budget_model is left null =
-- protected). Owner sets both models per feature; the guard is automatic.
-- =============================================================================

-- 1) Per-feature fallback used only when the acting user is over budget.
alter table public.model_config add column if not exists over_budget_model text;

-- Downgrade the high-volume / enrichment work; protect the three report
-- generators (leave their over_budget_model null).
update public.model_config set over_budget_model = 'claude-haiku-4-5'
  where feature in (
    'clean-observation', 'generate-reflection-questions', 'review-intent',
    'update-voice-profile', 'process-team-sheet', 'enrich-reflection'
  );

-- 2) is_over_budget(user) — month-to-date cost vs the sum of the user's active
--    plan budgets. No active plan -> effectively unlimited (never over).
create or replace function public.is_over_budget(target uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select sum(cost_usd) from public.usage_events
      where user_id = target and created_at >= date_trunc('month', now())), 0)
    >= coalesce(
    (select sum(p.ai_budget_usd) from public.subscriptions s
      join public.plans p on p.id = s.plan_id
      where s.user_id = target
        and (s.status = 'active'
             or (s.status = 'trialing' and coalesce(s.trial_ends_at, now()) >= now()))),
    1e9);
$$;
grant execute on function public.is_over_budget(uuid) to authenticated;

-- 3) analytics_user_budget — per-user spend against budget, for the dashboard
--    flag. Admin-only (the is_admin() gate returns zero rows to anyone else).
create or replace view public.analytics_user_budget as
  select
    m.user_id,
    round(m.cost_usd, 4)      as cost_this_month_usd,
    round(b.budget, 2)        as budget_usd,
    (m.cost_usd >= b.budget)  as over_budget
  from (
    select user_id, sum(cost_usd) as cost_usd
    from public.usage_events
    where created_at >= date_trunc('month', now())
    group by user_id
  ) m
  cross join lateral (
    select coalesce(sum(p.ai_budget_usd), 1e9) as budget
    from public.subscriptions s join public.plans p on p.id = s.plan_id
    where s.user_id = m.user_id
      and (s.status = 'active'
           or (s.status = 'trialing' and coalesce(s.trial_ends_at, now()) >= now()))
  ) b
  where public.is_admin()
  order by over_budget desc, cost_usd desc;

grant select on public.analytics_user_budget to authenticated;
