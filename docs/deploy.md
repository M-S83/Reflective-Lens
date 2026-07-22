# Go live — deploy the Reflective Lens backend

Stand up a live Supabase project (database + edge functions + secrets) so there's
a working API to build the frontend against. ~15 minutes, mostly copy-paste.
Everything here has been validated against PostgreSQL 16.

## 0. What you need

- A [Supabase](https://supabase.com) account and a **new project** (note the
  **project ref** — the `abcd...` in its URL — and the **database password** you
  set).
- The [Supabase CLI](https://supabase.com/docs/guides/cli) installed
  (`brew install supabase/tap/supabase`, or see the docs).
- An **Anthropic API key** (required) and an **OpenAI API key** (required for
  voice transcription). Stripe keys only if you'll charge.

## 1. Link the project

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

## 2. Fill in secrets

```bash
cp .env.example .env
# edit .env — set ANTHROPIC_API_KEY, OPENAI_API_KEY,
# LEARNING_CRON_SECRET (run: openssl rand -hex 24), APP_URL
```

## 3. Deploy everything

```bash
./scripts/deploy.sh
```

This pushes migrations `0001–0006` (all tables, RLS, analytics, learning, and the
FA/Coachcast knowledge base seed), sets the function secrets, and deploys all 14
edge functions. Re-runnable any time you change the backend.

## 4. Auth setup (dashboard)

In **Authentication → URL Configuration**: set **Site URL** to your `APP_URL` and
add it to **Redirect URLs** (needed for email magic-link/OTP and the PWA).
- **Email** sign-in works out of the box.
- **Phone/SMS** sign-in: add a provider under **Authentication → Providers →
  Phone** (e.g. Twilio) — see the SMS note in `supabase/config.toml`.

Storage buckets (`audio-recordings`, `uploads`, `reports`) are created by the
migrations — confirm under **Storage**.

## 5. Make yourself admin + schedule learning

Sign up once in your app (or via the dashboard), then open the **SQL editor**,
paste `supabase/go-live.sql`, fill in the `<PLACEHOLDERS>`, and run it. That:
- grants your account the `admin` role (for the hidden analytics dashboard), and
- schedules the `run-learning` sweep via `pg_cron` (enable **pg_cron** + **pg_net**
  under **Database → Extensions** first).

## 6. Smoke test

```bash
./scripts/smoke-test.sh https://<your-project-ref>.supabase.co
```

A `200` from each function means the backend is live. Real calls need a signed-in
user's JWT — which the frontend supplies.

## 7. (Optional) Billing

If charging: create a Stripe webhook pointing at
`https://<ref>.supabase.co/functions/v1/billing-webhook` for the events
`checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`; put its signing secret in `STRIPE_WEBHOOK_SECRET`
and re-run `./scripts/deploy.sh`. See `docs/analytics.md`.

---

Once this is up you have a live API: Auth, Postgres with RLS, Storage, and all the
edge functions. The frontend (see `docs/lovable-prompt.md`) points at
`https://<ref>.supabase.co` with the project's anon key and it's a working app.
