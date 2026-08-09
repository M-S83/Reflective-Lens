-- =============================================================================
-- 0024_one_account_per_address.sql — never guess which account was meant.
--
-- Two accounts exist for coachmsmith19@gmail.com and Coachmsmith19@gmail.com.
-- Gmail delivers both to one inbox, so that is one person, one mailbox, and two
-- separate sets of sessions, with nothing to show anything is wrong until they
-- type it the other way one evening and find an empty app.
--
-- The app now lowercases every address before it sends one (web/src/lib/email.ts),
-- which stops another pair being made. This is the other half: coping with the
-- ones that already exist.
--
-- THE BUG THIS CLOSES. 0022's grant_plan matches case-insensitively, which is
-- right, and then does:
--
--     select id into v_user from public.profiles
--       where lower(email) = lower(trim(p_email));
--
-- In plpgsql, SELECT INTO with more than one matching row takes the first one
-- the planner happens to return and carries on without a word. So granting beta
-- to a coach who has a case-pair silently picks one of their two accounts, and
-- the odds are even that it is the empty one. They would be told they had
-- access, sign in, and not have it.
--
-- Raising is the only honest answer: the app cannot know which was meant, and
-- neither can I. The message says exactly what to do about it.
-- =============================================================================

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
  v_n      integer;
  v_role   text;
  v_status text;
  v_ends   timestamptz;
begin
  if not public.is_admin() then
    raise exception 'grant_plan is for admins only';
  end if;

  -- Counted first, then fetched. min(id) would say this in one query, but
  -- min(uuid) is a PostgreSQL 17 aggregate and Supabase runs 16, so it fails
  -- outright: the first version of this silently broke every grant.
  select count(*) into v_n
  from public.profiles
  where lower(email) = lower(trim(p_email));

  if v_n = 0 then
    raise exception 'no account with email %. They must sign up first.', p_email;
  end if;
  if v_n > 1 then
    raise exception
      'more than one account matches % (differing only by capitals). Delete the '
      'one with no work in it before granting, so the access lands on the right '
      'account.', p_email;
  end if;

  select id into v_user from public.profiles
  where lower(email) = lower(trim(p_email));

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

  -- One clock per coach: see 0022.
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

-- Same reasoning: taking access away from the wrong one of a pair leaves the
-- coach locked out of the account holding their work.
create or replace function public.revoke_plan(p_email text, p_plan text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid;
  v_n    integer;
  v_hit  integer;
begin
  if not public.is_admin() then
    raise exception 'revoke_plan is for admins only';
  end if;

  select count(*) into v_n
  from public.profiles
  where lower(email) = lower(trim(p_email));

  if v_n = 0 then
    raise exception 'no account with email %', p_email;
  end if;
  if v_n > 1 then
    raise exception
      'more than one account matches % (differing only by capitals). Say which '
      'one by deleting the other first.', p_email;
  end if;

  select id into v_user from public.profiles
  where lower(email) = lower(trim(p_email));

  update public.subscriptions
     set status = 'canceled', updated_at = now()
   where user_id = v_user and plan_id = p_plan and status <> 'canceled';
  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    return format('%s was not on %s, nothing to change', p_email, p_plan);
  end if;
  return format('%s no longer has %s. Their work is intact and still readable.', p_email, p_plan);
end;
$$;

-- -----------------------------------------------------------------------------
-- And a way to see them, so you are not hunting.
-- -----------------------------------------------------------------------------
-- Admin-gated inside the view, because views carry no RLS and this is a list of
-- email addresses.
create or replace view public.admin_duplicate_emails as
  select
    lower(p.email)                       as email,
    count(*)                             as accounts,
    array_agg(p.email order by p.created_at) as spellings,
    array_agg(p.id    order by p.created_at) as user_ids,
    min(p.created_at)                    as first_seen
  from public.profiles p
  where p.email is not null
    and public.is_admin()
  group by lower(p.email)
  having count(*) > 1;

grant select on public.admin_duplicate_emails to authenticated;

comment on view public.admin_duplicate_emails is
  'Admin: addresses held by more than one account, differing only by capitals. '
  'Empty is the healthy state. See 0024.';
