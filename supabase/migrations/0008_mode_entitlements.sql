-- =============================================================================
-- 0008_mode_entitlements.sql
-- Mode availability is driven by subscription, and coach/player stay isolated:
--   • a user may hold more than one plan (e.g. a coach who also plays), so the
--     one-row-per-user limit becomes one-row-per-(user, plan);
--   • active_roles() tells the app which modes a user may use right now;
--   • start_trial() is the ONLY subscription write a client can trigger — it can
--     only ever create a one-month *trialing* row on a role's entry (monthly)
--     plan, once per role. It can never grant 'active' or forge paid status.
--     When Stripe is wired, the trial auto-converts to the monthly subscription
--     unless cancelled; the annual plan (25% off) is chosen at checkout instead.
-- =============================================================================

-- 1) One row per (user, plan), not one per user.
alter table public.subscriptions drop constraint if exists subscriptions_user_id_key;
create unique index if not exists subscriptions_user_plan_key
  on public.subscriptions (user_id, plan_id);

-- 2) active_roles(user) — distinct roles the user has a USABLE (active, or
--    unexpired trial) subscription for. Reads plans.features->>'role'.
create or replace function public.active_roles(target uuid default auth.uid())
returns text[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(distinct (p.features->>'role')), '{}')
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.user_id = target
    and (p.features->>'role') is not null
    and (
      s.status = 'active'
      or (s.status = 'trialing' and coalesce(s.trial_ends_at, now()) >= now())
    );
$$;

-- 3) has_role(role, user) — is a specific role usable right now?
create or replace function public.has_role(p_role text, target uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$ select p_role = any(public.active_roles(target)); $$;

-- 4) start_trial(role) — self-serve 14-day trial, safely. SECURITY DEFINER so it
--    can write the subscription the client's own RLS forbids, but it is tightly
--    bounded: trialing only, 14 days, the role's entry plan, once per role.
create or replace function public.start_trial(p_role text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  v_plan := case p_role
              when 'coach'  then 'coach_monthly'
              when 'player' then 'player_monthly'
            end;
  if v_plan is null then raise exception 'unknown role: %', p_role; end if;

  -- Idempotent: skip if the role is already usable, or a row for its entry
  -- plan already exists (so a lapsed trial cannot be restarted for free).
  if public.has_role(p_role, v_user)
     or exists (select 1 from public.subscriptions
                where user_id = v_user and plan_id = v_plan) then
    return;
  end if;

  insert into public.subscriptions (user_id, plan_id, status, trial_ends_at)
  values (v_user, v_plan, 'trialing', now() + interval '1 month');
end;
$$;

grant execute on function public.active_roles(uuid)     to authenticated;
grant execute on function public.has_role(text, uuid)   to authenticated;
grant execute on function public.start_trial(text)      to authenticated;
