-- =============================================================================
-- go-live.sql — run ONCE in the Supabase SQL editor after deploying, editing the
-- <PLACEHOLDERS> first. Two steps: make yourself admin, and schedule the
-- continuous-learning sweep.
-- =============================================================================

-- 1) ADMIN — grant yourself the admin role (needed for the hidden analytics
--    dashboard). Sign up in the app FIRST, then run this with your email.
--
--    Admin lives in user_roles, NOT profiles.role (see migration 0016): the
--    profile row is one a user can update themselves, so a privilege that sat on
--    it could be granted by the user to themselves. Setting profiles.role to
--    'admin' now raises deliberately.
insert into public.user_roles (user_id, role)
select p.id, 'admin'::user_role
from public.profiles p
where p.email = '<YOUR_SIGNUP_EMAIL>'
on conflict (user_id, role) do nothing;

--    Check it took (expects one row):
--      select u.role from public.user_roles u
--      join public.profiles p on p.id = u.user_id
--      where p.email = '<YOUR_SIGNUP_EMAIL>';

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

-- 3) ACCOUNT DELETION PURGE (recommended if you offer account deletion)
--    Hard deletes accounts whose 30-day recovery window has passed. Daily at
--    03:00. Needs pg_cron + pg_net (same as above).
select cron.schedule(
  'reflective-lens-purge-accounts',
  '0 3 * * *',
  $$
    select net.http_post(
      url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/purge-due-accounts',
      headers := jsonb_build_object(
        'content-type',  'application/json',
        'x-cron-secret', '<PURGE_CRON_SECRET>'   -- same value as in .env
      ),
      body := '{}'::jsonb
    );
  $$
);
-- To stop it:
--   select cron.unschedule('reflective-lens-purge-accounts');

-- 4) TRIAL REMINDERS (optional; only does anything once email is configured)
--    Emails a coach at 7 days and 1 day before their free month ends. Daily at
--    09:00. Needs pg_cron + pg_net, plus RESEND_API_KEY and EMAIL_FROM set as
--    function secrets. Without those the sweep runs and cleanly does nothing.
--    email_deliveries has unique (user_id, kind), so a repeat run in the same
--    day cannot send the same message twice.
select cron.schedule(
  'reflective-lens-trial-reminders',
  '0 9 * * *',
  $$
    select net.http_post(
      url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-trial-reminders',
      headers := jsonb_build_object(
        'content-type',  'application/json',
        'x-cron-secret', '<TRIAL_CRON_SECRET>'   -- same value as in .env
      ),
      body := '{}'::jsonb
    );
  $$
);
-- To stop it:
--   select cron.unschedule('reflective-lens-trial-reminders');
