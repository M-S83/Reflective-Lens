-- =============================================================================
-- 0016_user_roles.sql — privilege roles move off profiles.
--
-- THE HOLE THIS CLOSES. is_admin() read profiles.role, and "profiles: update
-- self" (0002) lets a user update their own profile row with no restriction on
-- which columns they may touch. Supabase grants `authenticated` update on public
-- tables by default, and nothing guarded the column, so any signed-in user could
-- run one statement:
--
--   update public.profiles set role = 'admin' where id = auth.uid();
--
-- and become an admin. That opens every user's usage and cost data (0004), the
-- billing catalogue (0009), model_config (0010) and the cost guard (0011).
--
-- THE FIX. A privilege role is not a property of a profile the user owns, so it
-- moves to its own table that the user has no write grant on at all. profiles.role
-- stays, but only as what it actually means day to day: which journey the person
-- is in (coach or player), which they are entitled to change. It can no longer
-- carry 'admin'.
--
-- Two independent locks on user_roles, so a mistake in either is not enough:
--   1. no insert/update/delete grant to anon or authenticated (service_role and
--      the SQL editor only), and
--   2. RLS restricting select to your own rows.
-- =============================================================================

create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       user_role not null,
  granted_at timestamptz not null default now(),
  unique (user_id, role)
);

create index user_roles_user_idx on public.user_roles (user_id);

-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated, which would hand back exactly the write access this migration
-- exists to remove. Revoke first, then grant back read only.
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "user_roles: read own" on public.user_roles for select
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- has_role() — security definer so it reads user_roles regardless of the
-- caller's RLS, which is what lets a policy ask "is this person an admin?"
-- without granting them sight of anyone else's roles.
-- -----------------------------------------------------------------------------
create or replace function public.has_role(_user_id uuid, _role user_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id and ur.role = _role
  );
$$;

-- Carry existing admins across before is_admin() stops reading profiles, so
-- nobody is locked out of the dashboard by this migration.
insert into public.user_roles (user_id, role)
  select p.id, 'admin'::user_role from public.profiles p where p.role = 'admin'
  on conflict (user_id, role) do nothing;

-- Same signature and meaning as 0004, now sourced from user_roles. Every policy
-- that already calls is_admin() keeps working untouched.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin');
$$;

-- -----------------------------------------------------------------------------
-- profiles.role can no longer be set to 'admin'.
--
-- A trigger rather than a column-level revoke: revoking update on one column
-- does nothing while a table-level update grant is in force, so it would have to
-- be revoked wholesale and re-granted column by column, which then silently
-- breaks every time a column is added. The trigger states the rule once and
-- cannot be outgrown.
--
-- Insert and update are treated differently on purpose. handle_new_user (0001)
-- builds the profile from raw_user_meta_data, which the person signing up
-- controls, so a crafted sign-up can ask for 'admin'. Raising there would leave
-- them with a broken account and a confusing error for something that is not
-- their business to set, so an insert is quietly coerced to 'coach' instead. An
-- update is different: it is either an attack or a caller that has not been told
-- where roles live, and both deserve to fail loudly. Demotion stays allowed so
-- the column can still be tidied.
-- -----------------------------------------------------------------------------
create or replace function public.profiles_block_admin_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role = 'admin'::user_role then
    if tg_op = 'INSERT' then
      new.role := 'coach'::user_role;
    elsif old.role is distinct from 'admin'::user_role then
      raise exception
        'profiles.role cannot be set to admin. Admin is granted in public.user_roles.'
        using hint = 'insert into public.user_roles (user_id, role) values (<id>, ''admin'');';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_block_admin_role
  before insert or update of role on public.profiles
  for each row execute function public.profiles_block_admin_role();

comment on table public.user_roles is
  'Privilege roles (admin). Separate from profiles.role, which is only the '
  'journey the user is in. Users have no write grant here.';
