-- =============================================================================
-- 0010_model_config.sql — owner-adjustable model tiering.
-- The model each AI feature uses moves out of hardcoded clients.ts and into this
-- table. callClaude reads it (cached briefly) and overrides its default, so the
-- owner can retune tiers from the dashboard without a redeploy. Admin manages it;
-- edge functions read it via the service role (which bypasses RLS).
-- =============================================================================
create table public.model_config (
  feature    text primary key,
  model      text not null,
  updated_at timestamptz not null default now()
);

alter table public.model_config enable row level security;

create policy "model_config: admin all" on public.model_config for all
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.model_config to authenticated;

create trigger model_config_set_updated_at
  before update on public.model_config
  for each row execute function public.set_updated_at();

-- Seed with the current tiering (Haiku for high-volume work, Sonnet for the
-- reader-facing prose). Keys match the `feature` each function passes to callClaude.
insert into public.model_config (feature, model) values
  ('clean-observation',             'claude-haiku-4-5'),
  ('generate-reflection-questions', 'claude-haiku-4-5'),
  ('review-intent',                 'claude-haiku-4-5'),
  ('update-voice-profile',          'claude-haiku-4-5'),
  ('process-team-sheet',            'claude-haiku-4-5'),
  ('enrich-reflection',             'claude-sonnet-5'),
  ('generate-report',               'claude-sonnet-5'),
  ('generate-period-report',        'claude-sonnet-5'),
  ('generate-player-summary',       'claude-sonnet-5')
on conflict (feature) do nothing;
