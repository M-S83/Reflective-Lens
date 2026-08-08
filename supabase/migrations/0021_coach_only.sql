-- =============================================================================
-- 0021_coach_only.sql — the player journey is withdrawn.
--
-- The app is one journey now: a coach reflecting on their own sessions. The
-- player screens, the role chooser, the mode switch and generate-player-summary
-- are gone from the codebase. This closes the door on the database side so the
-- two cannot drift back apart: nothing may start a player trial, and the player
-- plan cannot be subscribed to.
--
-- WHAT THIS DOES NOT DO, and why. It does not drop player_game_log,
-- player_development_notes, or the 'player' values in the user_role and
-- reflection_type enums.
--
--   * Dropping a table is irreversible and destroys anything already in it.
--     Nothing writes to these now, so they cost nothing to leave in place.
--   * Removing a value from a Postgres enum is not supported without rebuilding
--     the type and every column using it, which is a large and risky operation
--     to buy nothing.
--   * If the player journey ever returns, the shape it needs is still here.
--
-- Dormant, not deleted. The gate is start_trial and the plan catalogue.
-- =============================================================================

-- The entry point. start_trial() mapped 'player' to the player plan, so this is
-- what actually prevents a player account from coming into existence. It raises
-- rather than silently ignoring: a caller asking for a player trial is running
-- against a version of the app that no longer exists, and should be told.
create or replace function public.start_trial(p_role text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  if p_role = 'player' then
    raise exception 'the player journey has been withdrawn (0021)';
  end if;

  v_plan := case p_role when 'coach' then 'coach_monthly' end;
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

-- Off the catalogue, so it cannot be bought and does not appear in pricing.
-- Left as a row rather than deleted: existing subscriptions reference it by
-- foreign key, and anyone who somehow holds one keeps read access to their own
-- work rather than having it vanish underneath them.
update public.plans set is_active = false
  where id like 'player%' or (features ->> 'role') = 'player';

comment on function public.start_trial(text) is
  'Starts the free month for the coach journey. Raises on ''player'': that '
  'journey was withdrawn in 0021.';
