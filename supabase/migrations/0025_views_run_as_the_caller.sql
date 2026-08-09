-- =============================================================================
-- 0025_views_run_as_the_caller.sql — stop the views being the only guard.
--
-- Supabase's security advisor flags all thirteen analytics/admin views as
-- "Security Definer View", CRITICAL. Worth being precise about what that does
-- and does not mean here.
--
-- A Postgres view runs as its OWNER unless told otherwise, so it reads the
-- underlying tables past their row-level security. Every one of these views
-- already answers that with a gate in its own body:
--
--     ... where public.is_admin();
--
-- so a signed-in non-admin selecting from one gets zero rows, and the DB tests
-- prove exactly that rather than assuming it. Nothing is open today.
--
-- The advisor is still right, because that gate is the ONLY thing holding. Add a
-- view later, forget the where clause, and it reads every row of every table it
-- touches with nothing behind it to say no. A defence you have to remember is
-- one you will eventually forget, and this is a list of coaches' email addresses
-- and cost data.
--
-- security_invoker makes a view run as the person querying it, so the tables'
-- own RLS applies. The is_admin() gates stay where they are and become the
-- second line rather than the only one. A forgotten gate then leaks nothing,
-- because the tables underneath still refuse.
--
-- THE ONE THING IN THE WAY. Every source table already lets an admin read:
-- usage_events, feature_events, landing_events, feedback, learning_state,
-- subscriptions, payment_records, plans. Except profiles, which since 0002 has
-- been "read self" and nothing else. Under invoker rules admin_accounts would
-- return the admin's own row and no one else's, and the Owner dashboard would
-- show a list of one.
--
-- So profiles gains an admin read. That widens nothing in practice: an admin can
-- already read every profile through admin_accounts. It moves the permission out
-- of a view body and into RLS, where it is visible, checkable and enforced on
-- every path rather than one.
--
-- Writing to profiles is untouched: still self only, and 0016's trigger still
-- refuses to let anyone hand themselves 'admin' through it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) An admin may read a profile.
-- -----------------------------------------------------------------------------
drop policy if exists "profiles: read self" on public.profiles;

create policy "profiles: read self or admin" on public.profiles for select
  using (id = auth.uid() or public.is_admin());

-- -----------------------------------------------------------------------------
-- 2) Every view runs as its caller.
-- -----------------------------------------------------------------------------
-- Listed one per line rather than looped, so the set is visible in the diff and
-- a view added later has to be added here deliberately.
alter view public.analytics_overview            set (security_invoker = true);
alter view public.analytics_daily_active_users  set (security_invoker = true);
alter view public.analytics_feature_usage       set (security_invoker = true);
alter view public.analytics_user_cost_monthly   set (security_invoker = true);
alter view public.analytics_cost_daily          set (security_invoker = true);
alter view public.analytics_mrr                 set (security_invoker = true);
alter view public.analytics_user_budget         set (security_invoker = true);
alter view public.analytics_learning_recent     set (security_invoker = true);
alter view public.analytics_feature_adoption    set (security_invoker = true);
alter view public.analytics_feature_daily       set (security_invoker = true);
alter view public.analytics_landing             set (security_invoker = true);
alter view public.analytics_feedback_summary    set (security_invoker = true);
alter view public.admin_accounts                set (security_invoker = true);
alter view public.admin_duplicate_emails        set (security_invoker = true);

comment on policy "profiles: read self or admin" on public.profiles is
  'An admin may read any profile, which the Owner dashboard needs and previously '
  'took by way of a definer view. Writing is still self only. See 0025.';
