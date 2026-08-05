-- =============================================================================
-- 0017_glossary_analytics_trial.sql — the coach's own vocabulary, product
-- analytics, the free month, and a payment record.
--
-- Ported from the parallel Lovable build (M-S83/reflective-vision-lens), adapted
-- to this repo's conventions: owner-only RLS, is_admin() for anything that reads
-- across users, and no in-app sharing.
--
-- On coach_glossary specifically. This is the most on-brand of the four: it is
-- the coach teaching the app THEIR words, not the app teaching the coach. If a
-- coach says "the pocket" or "third man", the report should say it back the same
-- way rather than translating it into textbook language. That is mirror, not
-- verdict applied to vocabulary. See _shared/voice.ts for how it reaches a
-- prompt, and note what it must never become: a glossary entry explains what the
-- coach means, it never licenses the model to judge whether they are right.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- COACH GLOSSARY — the coach's own terms, in their own words.
-- -----------------------------------------------------------------------------
create table public.coach_glossary (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  term       text not null,
  meaning    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, term)
);

create index coach_glossary_user_idx on public.coach_glossary (user_id);

alter table public.coach_glossary enable row level security;

create policy "glossary: read own" on public.coach_glossary for select
  using (user_id = auth.uid());
create policy "glossary: insert own" on public.coach_glossary for insert
  with check (user_id = auth.uid());
create policy "glossary: update own" on public.coach_glossary for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "glossary: delete own" on public.coach_glossary for delete
  using (user_id = auth.uid());

create trigger coach_glossary_set_updated_at
  before update on public.coach_glossary
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- FEATURE EVENTS — which features get used, by whom, how often.
--
-- Deliberately NOT usage_events (0004). That table answers "what did this cost",
-- carries tokens and cost_usd, and is written server side by callClaude. This one
-- answers "did anyone use this", is written from the client, and has no money in
-- it. Keeping them apart stops product questions polluting the cost ledger.
--
-- Insert-only for the owner: a user can record their own activity but cannot
-- rewrite history, and cannot read anyone else's.
-- -----------------------------------------------------------------------------
create table public.feature_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  feature    text not null,
  action     text not null default 'used',
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index feature_events_user_idx on public.feature_events (user_id);
create index feature_events_feature_idx on public.feature_events (feature);
create index feature_events_created_idx on public.feature_events (created_at desc);

alter table public.feature_events enable row level security;

create policy "feature_events: insert own" on public.feature_events for insert
  with check (user_id = auth.uid());
create policy "feature_events: read own or admin" on public.feature_events for select
  using (user_id = auth.uid() or public.is_admin());

-- -----------------------------------------------------------------------------
-- LANDING EVENTS — the funnel before sign-up.
--
-- visitor_id is a random client-side id, not an identity: these rows exist to
-- count "how many people reached pricing", not to follow a person. user_id is
-- nullable and set only once someone signs up, which is what lets a visit be
-- joined to an account after the fact.
--
-- Anonymous insert is the point (there is no session yet), so this is the one
-- table anon may write. Reads are admin only.
-- -----------------------------------------------------------------------------
create table public.landing_events (
  id         uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  user_id    uuid references auth.users (id) on delete set null,
  event      text not null,
  path       text,
  referrer   text,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index landing_events_created_idx on public.landing_events (created_at desc);
create index landing_events_visitor_idx on public.landing_events (visitor_id);

alter table public.landing_events enable row level security;

grant insert on public.landing_events to anon;

create policy "landing_events: anyone may record" on public.landing_events for insert
  with check (true);
create policy "landing_events: admin reads" on public.landing_events for select
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- EMAIL DELIVERIES — what we have already sent, so we never send it twice.
--
-- The unique (user_id, kind) IS the idempotency: the trial sweep inserts before
-- it sends and treats a unique violation as "already done". A sweep that runs
-- twice in a day, or is retried after a timeout, therefore cannot double-email a
-- coach. Service role only: no user has any business reading or writing this.
-- -----------------------------------------------------------------------------
create table public.email_deliveries (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind    text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind)
);

revoke all on public.email_deliveries from anon, authenticated;
grant all on public.email_deliveries to service_role;

alter table public.email_deliveries enable row level security;

-- -----------------------------------------------------------------------------
-- PAYMENT RECORDS — a receipt history the user can see.
--
-- subscriptions (0009) holds the CURRENT state and is overwritten as it changes.
-- This is the append-only log behind it, so "when was I charged, and how much"
-- survives a plan change or cancellation. Written by billing-webhook under the
-- service role; the user may read their own rows and nothing else.
-- -----------------------------------------------------------------------------
create table public.payment_records (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid references auth.users (id) on delete set null,
  provider               text not null default 'stripe',
  provider_payment_id    text not null,
  provider_subscription_id text,
  provider_customer_id   text,
  invoice_number         text,
  plan_id                text,
  plan_name              text,
  billing_cycle          text,
  status                 text not null default 'completed',
  amount_pence           bigint,
  currency               text,
  billed_at              timestamptz,
  environment            text not null default 'live',
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

create index payment_records_user_idx on public.payment_records (user_id);
create index payment_records_billed_idx on public.payment_records (billed_at desc);

alter table public.payment_records enable row level security;

create policy "payments: read own or admin" on public.payment_records for select
  using (user_id = auth.uid() or public.is_admin());

-- -----------------------------------------------------------------------------
-- THE FREE MONTH. Stamped at sign-up so the clock starts on the account rather
-- than on first payment. Backfilled from created_at for anyone already here, so
-- existing accounts are not handed a second free month by this migration.
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists trial_started_at timestamptz not null default now();

update public.profiles set trial_started_at = created_at where created_at is not null;

comment on column public.profiles.trial_started_at is
  'Start of the 30 day free month. See send-trial-reminders.';

-- Days remaining, floored at zero. One definition, so the reminder sweep, the
-- account screen and any future gate cannot drift apart on the arithmetic.
create or replace function public.trial_days_left(_user_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select greatest(
    0,
    ceil(
      extract(epoch from (p.trial_started_at + interval '30 days' - now())) / 86400
    )::int
  )
  from public.profiles p
  where p.id = _user_id;
$$;
