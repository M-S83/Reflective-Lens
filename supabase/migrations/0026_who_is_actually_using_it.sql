-- =============================================================================
-- 0026_who_is_actually_using_it.sql — show activity beside the account.
--
-- The plan for the beta is to give the 90 days to the coaches who actually use
-- it. That is a good plan and the Owner dashboard cannot support it: admin_accounts
-- lists who signed up and what plan they hold, and says nothing about whether
-- anyone has written a word. Judging on who emailed back instead loses the coach
-- who used it six times and never got round to writing in, which is most coaches.
--
-- WHY THIS IS NOT JUST ANOTHER JOIN. Ownership-only access is the rule the whole
-- app rests on: events, observations, reflections and reports are readable by
-- the person who wrote them and nobody else, admin included. 0025 made every
-- view run as its caller precisely so that rule bites, so a count added straight
-- into the view would come back as zero for everyone but the owner, silently,
-- and look like nobody is using the app.
--
-- So the counting happens in a SECURITY DEFINER function, which is the narrow
-- exception the rule can carry: it returns HOW MANY and WHEN, never what. The
-- owner learns that a coach wrote four sessions and was last in on Tuesday. The
-- coach's notes about their under-12s stay exactly as private as before, and
-- there is still no path anywhere that lets an admin read them.
--
-- It gates by returning no rows rather than raising, because admin_accounts is
-- selected from by anyone signed in and answers a non-admin with zero rows. A
-- function that raised would turn that quiet no into an error, and the DB tests
-- assert the quiet no.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) How much, and how recently. Never what.
-- -----------------------------------------------------------------------------
create or replace function public.admin_activity()
returns table (
  user_id     uuid,
  sessions    integer,
  notes       integer,
  reflections integer,
  reports     integer,
  last_active timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    (select count(*) from public.events       e  where e.user_id    = p.id)::int,
    (select count(*) from public.observations o  where o.user_id    = p.id)::int,
    (select count(*) from public.reflections  r  where r.user_id    = p.id)::int,
    (select count(*) from public.reports      rp where rp.created_by = p.id)::int,
    -- greatest() ignores nulls here, so a coach who has only ever written a
    -- thought still gets a date rather than nothing.
    greatest(
      (select max(e.created_at) from public.events       e where e.user_id = p.id),
      (select max(o.created_at) from public.observations o where o.user_id = p.id),
      (select max(r.created_at) from public.reflections  r where r.user_id = p.id)
    )
  from public.profiles p
  where public.is_admin();
$$;

revoke all on function public.admin_activity() from public;
grant execute on function public.admin_activity() to authenticated;

comment on function public.admin_activity() is
  'Per-user counts and a last-active date, for the Owner dashboard. SECURITY '
  'DEFINER because events/observations/reflections/reports are owner-only and '
  'stay that way: this returns how many and when, never any content. Returns no '
  'rows unless is_admin(). See 0026.';

-- -----------------------------------------------------------------------------
-- 2) Hang it off admin_accounts, so one list answers both questions.
-- -----------------------------------------------------------------------------
-- Columns are added at the end, which is all create or replace view allows and
-- all that is wanted: nothing reading the existing eleven has to change.
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
    end                                    as days_left,
    coalesce(a.sessions, 0)                as sessions,
    coalesce(a.notes, 0)                   as notes,
    coalesce(a.reflections, 0)             as reflections,
    coalesce(a.reports, 0)                 as reports,
    a.last_active
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
  left join public.admin_activity() a on a.user_id = p.id
  where public.is_admin();

grant select on public.admin_accounts to authenticated;

-- Re-asserted rather than assumed. create or replace view rewrites the view's
-- options, and losing this would quietly put 0025 back where it started.
alter view public.admin_accounts set (security_invoker = true);

comment on view public.admin_accounts is
  'Who is on what, and how much they have used it. Gated by is_admin() in the '
  'body and by RLS underneath (0025). Activity comes from admin_activity(), '
  'which counts without reading. See 0022 and 0026.';
