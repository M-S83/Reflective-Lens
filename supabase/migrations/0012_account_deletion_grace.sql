-- =============================================================================
-- 0012_account_deletion_grace.sql — 30-day recovery window for account deletion.
-- Deleting an account no longer wipes it immediately. Requesting deletion just
-- schedules it 30 days out; until then the user can undo and keep everything.
-- A daily cron (purge-due-accounts) does the irreversible hard delete once the
-- scheduled date has passed. See docs/deploy.md and supabase/go-live.sql.
-- =============================================================================

-- When deletion was asked for, and when the hard delete becomes due. Null = the
-- account is live and not scheduled for deletion.
alter table public.profiles
  add column if not exists deletion_requested_at  timestamptz,
  add column if not exists deletion_scheduled_at  timestamptz;

-- request_account_deletion() — schedule the caller's own account for deletion in
-- 30 days. Idempotent: if already scheduled, keep the existing date (a second
-- request never pushes the clock back or forward). Returns the scheduled date.
create or replace function public.request_account_deletion()
returns timestamptz language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_when timestamptz;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select deletion_scheduled_at into v_when
  from public.profiles where id = v_user;

  if v_when is null then
    v_when := now() + interval '30 days';
    update public.profiles
      set deletion_requested_at = now(), deletion_scheduled_at = v_when
      where id = v_user;
  end if;

  return v_when;
end;
$$;

-- cancel_account_deletion() — the undo. Clears the schedule on the caller's own
-- account so it stays live. Safe to call when nothing is scheduled.
create or replace function public.cancel_account_deletion()
returns void language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update public.profiles
    set deletion_requested_at = null, deletion_scheduled_at = null
    where id = v_user;
end;
$$;

grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion()  to authenticated;

-- The purge sweep reads due accounts with the service role (which bypasses RLS),
-- so no SELECT helper is exposed to clients — listing who is due stays private.
