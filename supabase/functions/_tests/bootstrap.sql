-- Stubs for a throwaway PostgreSQL 16 cluster so `supabase/migrations/000*.sql`
-- can be applied and RLS exercised without a real Supabase instance.
--
-- auth.uid() reads the `test.uid` GUC, so a test sets the acting user with
--   select set_config('test.uid', '<uuid>', true);
-- inside the same transaction as the query it wants RLS to apply to.

create extension if not exists pgcrypto;

create schema if not exists auth;
create schema if not exists storage;

create role anon;
create role authenticated;
create role service_role;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  phone              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create table if not exists storage.buckets (
  id         text primary key,
  name       text not null,
  public     boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id) on delete cascade,
  name       text not null,
  owner      uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select string_to_array(name, '/')
$$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant all on all tables in schema storage to authenticated;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
