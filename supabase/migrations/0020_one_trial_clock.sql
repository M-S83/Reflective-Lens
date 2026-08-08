-- =============================================================================
-- 0020_one_trial_clock.sql — the free month is measured in one place.
--
-- 0017 added profiles.trial_started_at and trial_days_left(), and did not notice
-- that a trial clock already existed: start_trial() (0008) writes
-- subscriptions.trial_ends_at when the user picks their role.
--
-- Two clocks, started at different moments and computed differently:
--
--   profiles.trial_started_at   defaults to now() at SIGN-UP, plus 30 days
--   subscriptions.trial_ends_at set at ROLE CHOICE, as now() + 1 month
--
-- They agree only when someone picks their role the instant they sign up.
-- Anyone who signs up, looks around and comes back on Thursday gets an Account
-- screen counting down to one date while their access actually ends on another,
-- and a reminder email fired against the wrong one. The screen is not the one
-- that matters: subscriptions.trial_ends_at is what active_roles() checks, so
-- that is what the user actually lives by.
--
-- So trial_days_left() now reads the subscription when there is one, and only
-- falls back to the profile stamp for an account that has not picked a role yet
-- (where there is no subscription row, and the sign-up date is the honest
-- answer). One number, and it is the number that governs access.
-- =============================================================================

create or replace function public.trial_days_left(_user_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select greatest(
    0,
    ceil(
      extract(epoch from (
        coalesce(
          -- What actually gates access, whichever role's trial runs longest.
          (select max(s.trial_ends_at) from public.subscriptions s
            where s.user_id = _user_id and s.status = 'trialing'),
          -- No subscription yet: the account exists but no role is chosen.
          (select p.trial_started_at + interval '30 days' from public.profiles p
            where p.id = _user_id)
        ) - now()
      )) / 86400
    )::int
  );
$$;

comment on function public.trial_days_left(uuid) is
  'Days left of the free month. Reads subscriptions.trial_ends_at (what '
  'active_roles() actually enforces) and falls back to profiles.trial_started_at '
  'only before a role is chosen. See 0020.';
