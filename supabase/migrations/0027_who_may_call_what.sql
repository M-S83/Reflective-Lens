-- =============================================================================
-- 0027_who_may_call_what.sql — stop handing out EXECUTE to everyone.
--
-- The advisor's CRITICALs are gone after 0025. What is left includes two lints
-- that fire on every SECURITY DEFINER function in the schema, which reads like
-- noise and is not: forty-odd identical warnings hide the two that matter.
--
-- POSTGRES GRANTS EXECUTE ON A NEW FUNCTION TO PUBLIC. That is the whole story.
-- Nobody wrote a grant making these callable by strangers; the default did, and
-- Supabase publishes every function in `public` at /rest/v1/rpc/<name>, reachable
-- with the anon key that is embedded in the frontend and therefore public.
--
-- Two were actually exploitable, both from 0005, both granted to `authenticated`
-- by what looks like a copied grants block:
--
--   learning_due(max_rows)  SECURITY DEFINER, no gate, no auth.uid() filter. It
--     returns a row per user with pending learning. So anyone at all could list
--     the user ids of the whole user base and how many there are. Not notes, but
--     an enumeration that should never have been answerable to a stranger.
--
--   clear_learning_pending(target, which)  SECURITY DEFINER, takes ANY user id,
--     no gate. Any signed-in coach could clear another coach's pending markers,
--     which quietly stops the sweep ever learning from that coach's new work
--     again, and could insert learning_state rows for user ids at will. A write,
--     not a read, and the worst thing on the list.
--
-- Both are called only by the sweep, with the service role. So they lose PUBLIC
-- and go to service_role alone. Nothing in the app calls them.
--
-- WHAT IS DELIBERATELY LEFT ALONE. is_admin, active_roles, has_role,
-- has_active_subscription, can_access_event and can_access_report are named
-- inside RLS policies, and a policy expression is evaluated as the querying
-- role, so that role needs EXECUTE. Revoking them would not harden anything, it
-- would take the app off the air with "permission denied for function". They
-- stay callable, and they disclose nothing to a stranger: every one of them
-- resolves through auth.uid(), which is null for anon, so the honest answer to
-- an anonymous caller is false or nothing. The advisor will keep warning about
-- them. That is the right outcome, not an outstanding job.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) The two that were reachable.
-- -----------------------------------------------------------------------------
revoke execute on function public.learning_due(integer)              from public, anon, authenticated;
revoke execute on function public.clear_learning_pending(uuid, text) from public, anon, authenticated;
grant  execute on function public.learning_due(integer)              to service_role;
grant  execute on function public.clear_learning_pending(uuid, text) to service_role;

-- Called only by _shared/clients.ts through the service client, to decide
-- whether to force the cheap model tier. No policy names it.
revoke execute on function public.is_over_budget(uuid) from public, anon, authenticated;
grant  execute on function public.is_over_budget(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 2) Trigger functions, which nothing should ever call directly.
-- -----------------------------------------------------------------------------
-- Calling one over REST fails anyway ("trigger functions can only be called as
-- triggers"), so this closes no hole. It is worth doing because a published RPC
-- endpoint that exists to error is an invitation to go looking, and because the
-- advisor cannot tell these apart from the ones that mattered.
--
-- Revoking EXECUTE does NOT stop the triggers firing. Postgres checks that
-- privilege when the trigger is CREATED, not each time it runs, and the trigger
-- executes as the table owner regardless. The DB test writes rows afterwards to
-- prove exactly that rather than trusting the manual.
revoke execute on function public.set_updated_at()             from public, anon, authenticated;
revoke execute on function public.handle_new_user()            from public, anon, authenticated;
revoke execute on function public.profiles_block_admin_role()  from public, anon, authenticated;
revoke execute on function public.track_usage()                from public, anon, authenticated;
revoke execute on function public.mark_learning_pending()      from public, anon, authenticated;

-- Not created by any migration in this repo, so it may or may not be there.
-- Named by the advisor on the live project, which is enough reason to handle it
-- and not enough to assume it exists on a fresh database.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3) set_updated_at gets a fixed search_path.
-- -----------------------------------------------------------------------------
-- The one function in the schema without one. It is not SECURITY DEFINER, so
-- there is no privilege to steal through it, but a function that resolves names
-- against whatever search_path the caller happens to have is a loose end, and
-- this one is attached to six tables.
alter function public.set_updated_at() set search_path = public;

-- -----------------------------------------------------------------------------
-- 4) Signed-in RPCs stop being anonymous RPCs.
-- -----------------------------------------------------------------------------
-- Every one of these resolves through auth.uid(), so an anonymous caller gets
-- nothing useful today and grant_plan/revoke_plan raise outright. Closing them
-- anyway: "it happens to be harmless" is a property of today's function body,
-- and the body is the thing that gets edited.
revoke execute on function public.start_trial(text)                    from public, anon;
revoke execute on function public.trial_days_left(uuid)                from public, anon;
revoke execute on function public.grant_plan(text, text, integer)      from public, anon;
revoke execute on function public.revoke_plan(text, text)              from public, anon;
revoke execute on function public.request_account_deletion()           from public, anon;
revoke execute on function public.cancel_account_deletion()            from public, anon;

-- Re-granted explicitly, because revoking from PUBLIC takes it away from
-- everyone who only ever held it through PUBLIC.
grant execute on function public.start_trial(text)                     to authenticated;
grant execute on function public.trial_days_left(uuid)                 to authenticated;
grant execute on function public.grant_plan(text, text, integer)       to authenticated;
grant execute on function public.revoke_plan(text, text)               to authenticated;
grant execute on function public.request_account_deletion()            to authenticated;
grant execute on function public.cancel_account_deletion()             to authenticated;

-- -----------------------------------------------------------------------------
-- 5) landing_events: recordable by a stranger, not forgeable by one.
-- -----------------------------------------------------------------------------
-- The insert policy was `with check (true)`, which is right about the intent and
-- too generous about the detail. Anonymous visitors have to be able to record
-- that they landed, before they have an account, so the policy cannot ask who
-- they are. It can still refuse two things it was allowing:
--
--   attributing a visit to someone else, by putting any user_id in the row
--   arriving with a megabyte in the referrer field
--
-- Neither is a disaster and both are free to prevent.
drop policy if exists "landing_events: anyone may record" on public.landing_events;

create policy "landing_events: anyone may record their own" on public.landing_events for insert
  with check (
    (user_id is null or user_id = auth.uid())
    and length(visitor_id) between 1 and 64
    and length(event)      between 1 and 64
    and coalesce(length(path),     0) <= 512
    and coalesce(length(referrer), 0) <= 512
  );

comment on policy "landing_events: anyone may record their own" on public.landing_events is
  'A stranger may record a landing, because that is the point of the table, but '
  'may not attribute it to another account or arrive with an unbounded payload. '
  'See 0027.';
