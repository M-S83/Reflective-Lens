-- =============================================================================
-- 0022_account_kinds.sql — beta, comped and paid accounts.
--
-- Three kinds of account are needed: testers on a timer, coaches who are given
-- the app for nothing, and people who pay. It turns out the entitlement engine
-- already does all three, because active_roles() (0008) asks only whether a
-- subscription is usable, never why:
--
--     status = 'active'                              -> usable, no end date
--     status = 'trialing' and trial_ends_at >= now() -> usable until that date
--
-- So a "kind of account" is a plan plus one of those two states. Nothing about
-- access control changes here, and nothing new can go wrong in it:
--
--   beta   coach_beta    trialing   trial_ends_at = the day beta ends
--   comp   coach_comp    active     trial_ends_at null, so it never lapses
--   paid   coach_monthly active     Stripe keeps it in step
--
-- What is genuinely new is a way to HAND one out. start_trial() is the only
-- subscription write a client can make and it is deliberately tiny: trialing
-- only, one month, the entry plan, once. That is right for self-serve and no
-- use for giving a coach a year. grant_plan() is the admin twin of it, and the
-- two together are still the only paths that write a subscription.
--
-- NOTE ON is_active. The two new plans are is_active = false. That flag governs
-- the CATALOGUE (what can be bought and what shows in pricing), and neither of
-- these should ever be purchasable. It does not govern access: active_roles()
-- joins plans for features->>'role' and does not read is_active. Access
-- therefore still works, and 0022-db.sh proves it rather than trusting it,
-- because it is exactly the sort of coupling a later edit breaks by accident.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) The two plans.
-- -----------------------------------------------------------------------------
-- Priced at 0 so they cannot quietly add to MRR: analytics_mrr sums price_pence
-- over status='active' subscriptions, and a comped coach must not read as
-- revenue. sort_order is high so they sit last anywhere plans are listed.
insert into public.plans (id, name, description, price_pence, interval, is_active, sort_order, features)
values
  ('coach_beta', 'Beta', 'Free access while the app is in beta',
   0, 'month', false, 90, '{"role":"coach","kind":"beta"}'::jsonb),
  ('coach_comp', 'Complimentary', 'Free access, given by Reflective Lens',
   0, 'month', false, 91, '{"role":"coach","kind":"comp"}'::jsonb)
on conflict (id) do update
  set name = excluded.name,
      description = excluded.description,
      price_pence = excluded.price_pence,
      is_active = excluded.is_active,
      features = excluded.features;

-- Tag the paying plans too, so the app can name what someone is on from one
-- place rather than matching plan ids in the frontend.
update public.plans set features = features || '{"kind":"paid"}'::jsonb
  where id in ('coach_monthly', 'coach_season') and (features ->> 'kind') is null;

-- -----------------------------------------------------------------------------
-- 2) grant_plan(email, plan, days) — admin only.
-- -----------------------------------------------------------------------------
-- By email, because that is what you have when a coach asks for access. Returns
-- a sentence describing what happened, so the dashboard can show it rather than
-- guessing from a silent success.
--
-- p_days null  -> status 'active', no end date (comp, or a paid plan set by hand)
-- p_days given -> status 'trialing' ending that many days out (beta, extensions)
--
-- Re-granting the same plan EXTENDS it rather than failing on the unique index,
-- which is what "their beta runs to the end of the season now" should do.
create or replace function public.grant_plan(
  p_email text,
  p_plan  text,
  p_days  integer default null
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_user   uuid;
  v_role   text;
  v_status text;
  v_ends   timestamptz;
begin
  if not public.is_admin() then
    raise exception 'grant_plan is for admins only';
  end if;

  select id into v_user from public.profiles
    where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'no account with email %. They must sign up first.', p_email;
  end if;

  select (features ->> 'role') into v_role from public.plans where id = p_plan;
  if v_role is null then
    raise exception 'unknown plan %, or it grants no role', p_plan;
  end if;
  if v_role <> 'coach' then
    raise exception 'only coach plans can be granted (0021 withdrew the player journey)';
  end if;

  if p_days is null then
    v_status := 'active';
    v_ends   := null;
  else
    if p_days < 1 then raise exception 'days must be at least 1'; end if;
    v_status := 'trialing';
    v_ends   := now() + make_interval(days => p_days);
  end if;

  insert into public.subscriptions (user_id, plan_id, status, trial_ends_at)
  values (v_user, p_plan, v_status, v_ends)
  on conflict (user_id, plan_id) do update
    set status = excluded.status,
        trial_ends_at = excluded.trial_ends_at,
        updated_at = now();

  -- One clock per coach. The self-serve free month starts itself the first time
  -- someone signs in, so anyone you grant beta or comp to already has a
  -- coach_monthly trial ticking. Left alone, Account would count down that trial
  -- beside a beta that runs for months, and trial_days_left() would return
  -- whichever happened to be longer. Retiring the others makes the granted plan
  -- the only answer to "when does my access end".
  update public.subscriptions
     set status = 'canceled', updated_at = now()
   where user_id = v_user
     and plan_id <> p_plan
     and status = 'trialing';

  return format(
    '%s is on %s%s',
    p_email,
    (select name from public.plans where id = p_plan),
    case when v_ends is null then ', with no end date'
         else ' until ' || to_char(v_ends, 'DD Mon YYYY') end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) revoke_plan(email, plan) — admin only.
-- -----------------------------------------------------------------------------
-- Cancels rather than deletes. The row is the record that access was given, and
-- deleting it would let the same account start a fresh free month, because
-- start_trial() decides "already had one" by whether a row exists.
create or replace function public.revoke_plan(p_email text, p_plan text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid;
  v_hit  integer;
begin
  if not public.is_admin() then
    raise exception 'revoke_plan is for admins only';
  end if;

  select id into v_user from public.profiles
    where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'no account with email %', p_email;
  end if;

  update public.subscriptions
     set status = 'canceled', updated_at = now()
   where user_id = v_user and plan_id = p_plan and status <> 'canceled';
  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    return format('%s was not on %s, nothing to change', p_email, p_plan);
  end if;
  -- Read-only, not erased. Everything they have written stays theirs and stays
  -- exportable, which is what the app promises on the Account screen.
  return format('%s no longer has %s. Their work is intact and still readable.', p_email, p_plan);
end;
$$;

grant execute on function public.grant_plan(text, text, integer) to authenticated;
grant execute on function public.revoke_plan(text, text)         to authenticated;

-- -----------------------------------------------------------------------------
-- 4) admin_accounts — who is on what, for the owner dashboard.
-- -----------------------------------------------------------------------------
-- Views do not carry RLS, so the admin check lives INSIDE the view. Without it
-- this is a list of every user's email address readable by anyone signed in.
create or replace view public.admin_accounts as
  select
    p.id                                   as user_id,
    p.email,
    p.full_name,
    p.created_at                           as joined_at,
    s.plan_id,
    pl.name                                as plan_name,
    coalesce(pl.features ->> 'kind', 'paid') as kind,
    s.status,
    s.trial_ends_at,
    case
      when s.id is null then false
      when s.status = 'active' then true
      when s.status = 'trialing' and coalesce(s.trial_ends_at, now()) >= now() then true
      else false
    end                                    as usable,
    case
      when s.trial_ends_at is null then null
      else greatest(0, ceil(extract(epoch from (s.trial_ends_at - now())) / 86400)::int)
    end                                    as days_left
  from public.profiles p
  -- The subscription that actually governs them: usable first, then the one
  -- ending furthest out. A coach with a cancelled trial and a live comp should
  -- appear as comped, not as someone whose trial ran out.
  left join lateral (
    select s2.* from public.subscriptions s2
     where s2.user_id = p.id
     order by
       (s2.status = 'active'
        or (s2.status = 'trialing' and coalesce(s2.trial_ends_at, now()) >= now())) desc,
       s2.trial_ends_at desc nulls first
     limit 1
  ) s on true
  left join public.plans pl on pl.id = s.plan_id
  where public.is_admin();

grant select on public.admin_accounts to authenticated;

-- -----------------------------------------------------------------------------
-- 5) trial_days_left, corrected for access that is not a trial.
-- -----------------------------------------------------------------------------
-- 0020 made this read subscriptions.trial_ends_at, falling back to
-- profiles.trial_started_at + 30 days when there was no trialing row, on the
-- reading that no trial row meant "signed up, has not picked a role yet".
--
-- Granted plans break that reading. A comped coach has an ACTIVE row and no
-- trialing one, so the fallback fires and Account tells them they have 30 days
-- left of a free month they are not on, forever. Someone whose trial was
-- cancelled hits the same fallback and appears to get their month back.
--
-- Now each case is answered rather than inferred:
--   active row      -> 0, nothing is counting down
--   trialing row    -> what is left of it
--   no rows at all  -> the sign-up stamp, which is 0020's honest case
--   rows, none live -> 0, the free month is over
create or replace function public.trial_days_left(_user_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select case
    when exists (select 1 from public.subscriptions s
                  where s.user_id = _user_id and s.status = 'active') then 0
    when exists (select 1 from public.subscriptions s
                  where s.user_id = _user_id and s.status = 'trialing') then
      greatest(0, ceil(extract(epoch from (
        (select max(s.trial_ends_at) from public.subscriptions s
          where s.user_id = _user_id and s.status = 'trialing') - now()
      )) / 86400)::int)
    when not exists (select 1 from public.subscriptions s
                      where s.user_id = _user_id) then
      greatest(0, ceil(extract(epoch from (
        (select p.trial_started_at + interval '30 days' from public.profiles p
          where p.id = _user_id) - now()
      )) / 86400)::int)
    else 0
  end;
$$;

comment on function public.trial_days_left(uuid) is
  'Days left of the free month, and 0 when no free month is running (comped, '
  'paid, or already ended). See 0022, correcting the fallback added in 0020.';

comment on function public.grant_plan(text, text, integer) is
  'Admin: put an account on a plan. days null = active with no end date (comp), '
  'days given = trialing until then (beta). Cancels their other trials so there '
  'is one clock. See 0022.';
comment on function public.revoke_plan(text, text) is
  'Admin: cancel a granted plan. Keeps the row, so no fresh free month. See 0022.';
comment on view public.admin_accounts is
  'Admin: every account and the subscription that governs it. Gated by is_admin() '
  'inside the view, because views do not carry RLS.';
