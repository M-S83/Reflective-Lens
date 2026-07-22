-- =============================================================================
-- go-live.sql — run ONCE in the Supabase SQL editor after deploying, editing the
-- <PLACEHOLDERS> first. Two steps: make yourself admin, and schedule the
-- continuous-learning sweep.
-- =============================================================================

-- 1) ADMIN — grant yourself the admin role (needed for the hidden analytics
--    dashboard). Sign up in the app FIRST, then run this with your email.
update public.profiles
set role = 'admin'
where email = '<YOUR_SIGNUP_EMAIL>';

-- 2) CONTINUOUS LEARNING SWEEP (optional but recommended)
--    First enable the extensions under Database → Extensions: pg_cron, pg_net.
--    Then schedule run-learning. It only processes users with new input, so a
--    tighter cadence costs little; nightly at 02:00 shown here.
select cron.schedule(
  'reflective-lens-learning',
  '0 2 * * *',
  $$
    select net.http_post(
      url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-learning',
      headers := jsonb_build_object(
        'content-type',  'application/json',
        'x-cron-secret', '<LEARNING_CRON_SECRET>'   -- same value as in .env
      ),
      body := '{}'::jsonb
    );
  $$
);

-- To change the cadence later (e.g. every 3 hours):
--   select cron.schedule('reflective-lens-learning', '0 */3 * * *', $$ ... $$);
-- To stop it:
--   select cron.unschedule('reflective-lens-learning');
