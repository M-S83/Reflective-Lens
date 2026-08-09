-- =============================================================================
-- 0023_read_your_own_plan.sql — you can always read the plan you are on.
--
-- THE BUG. 0004 made the plan catalogue readable to signed-in users with
--
--     using (is_active or public.is_admin())
--
-- which is right for a catalogue: a plan that is not for sale should not appear
-- in one. Then 0022 added coach_beta and coach_comp with is_active = false,
-- precisely so they could not be bought, and in doing so made them unreadable
-- by the very people who are on them.
--
-- active_roles() never noticed, because it is SECURITY DEFINER and runs past
-- RLS. It answers {coach} for a beta tester, correctly, and account-kinds-db.sh
-- proved it. But the app does not ask active_roles(). The client reads the
-- tables directly, through RLS:
--
--     .from("subscriptions").select("status, trial_ends_at, plan:plans(name, features)")
--
-- and the embedded plan came back NULL. No plan means no features, no features
-- means no role, and a subscription with no role is skipped. Every beta and
-- complimentary coach would have signed in to a read-only app telling them
-- their access had ended, on the day they were invited to try it.
--
-- Two paths to the same question that do not agree, and only one of them tested.
-- The DB test proved the function; the app uses the tables. This migration
-- closes that, and 0022's test now checks the RLS path as well.
--
-- THE FIX. A plan is readable when it is on sale, when you are an admin, OR
-- when you hold a subscription to it. That last clause leaks nothing: you can
-- already read your own subscriptions row (0004), so you know the plan id; this
-- only lets you see the name and terms of the thing you are on, which is the
-- least a person is owed about their own account.
--
-- Not recursive: the subquery reads subscriptions, whose own policy reads
-- subscriptions and never mentions plans.
-- =============================================================================

drop policy if exists "plans: read active" on public.plans;

create policy "plans: read active or held" on public.plans for select
  using (
    is_active
    or public.is_admin()
    or exists (
      select 1 from public.subscriptions s
      where s.plan_id = plans.id
        and s.user_id = auth.uid()
    )
  );

comment on table public.plans is
  'The plan catalogue. Readable when on sale, by an admin, or by anyone holding '
  'a subscription to it. That last case is why granted plans (is_active = false, '
  'so they cannot be bought) are still visible to the coach who is on one. '
  'See 0023.';
