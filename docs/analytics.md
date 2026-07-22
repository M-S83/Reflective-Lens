# Usage analytics & monetisation

Backend for two things the product needs before it can be sold: **knowing how it's
used**, and **charging for it**. Both live in migration
`0004_usage_analytics.sql`. See `docs/cost-model.md` for what usage costs to run.

---

## Usage analytics

### One table: `usage_events`

Every meaningful action appends one row. Cost is computed **at the point of use**
and stored, so the dashboard never re-derives provider prices.

| Column | Meaning |
|---|---|
| `event_name` | `ai_call`, `transcription`, or an engagement event (`reflection_created`, `report_generated`, `event_created`, `observation_created`, `player_game_logged`) |
| `feature` | which function/feature produced it (e.g. `generate-report`) |
| `model`, `input_tokens`, `output_tokens` | for `ai_call` |
| `audio_seconds` | for `transcription` |
| `cost_usd` | provider cost of **this** event |
| `club_id`, `team_id`, `metadata` | scoping + extras (`event_type`, `report_type`, …) |

Two ways rows get written:

- **Cost events** — the edge functions log them. `callClaude()` records each AI
  call's token cost automatically (pass `feature` + `log`); `transcribe-audio`
  logs audio minutes × the Whisper rate. See `functions/_shared/clients.ts`.
- **Engagement events** — written by database triggers (`track_usage()`), so they
  fire no matter how the row was created and need no frontend code.

### RLS

- A user reads **only their own** `usage_events`; an **admin** (`profiles.role =
  'admin'`) reads everyone's — enforced by `is_admin()`.
- Clients may insert their **own** engagement events (e.g. `pdf_export`).
  Server-side cost logging uses the service role and bypasses RLS.

### Admin analytics views

All are gated by `is_admin()` inside the view, so a non-admin querying them gets
**zero rows** (verified in tests). Grant is `select` to `authenticated`; the gate
does the real work.

| View | Answers |
|---|---|
| `analytics_overview` | headline snapshot: users, 7/30-day actives, 30-day cost, reflections & reports, paying/trialing |
| `analytics_daily_active_users` | DAU + event volume per day |
| `analytics_feature_usage` | uses, distinct users, and **cost per feature** |
| `analytics_user_cost_monthly` | per-user AI calls, audio minutes, **cost per month** |
| `analytics_cost_daily` | daily provider cost split (AI text vs transcription) |
| `analytics_mrr` | monthly recurring revenue from active subscriptions |

---

## Monetisation

### `plans` + `subscriptions`

- `plans` — the catalogue (id, name, price in pence, `interval`, and an
  `ai_budget_usd` soft ceiling for margin monitoring). Public read for signed-in
  users; only admins manage it. Seeded with `free`, `coach_monthly`,
  `coach_season`, `player_monthly`, `player_season`, `club`.
- `subscriptions` — one row per user mirroring Stripe (status, Stripe ids, period,
  trial). Users read their own; **only the billing webhook writes it** — clients
  can't forge paid status.

### Entitlement

`has_active_subscription(user)` → true when a user is `active` or within an
unexpired `trialing` period. Gate paid features on it (in RLS or in the app).

### The Stripe loop (two edge functions)

1. **`create-checkout`** (JWT-verified) — a signed-in user picks a plan; this
   creates a Stripe Checkout Session (inline price from the plan) and returns its
   URL. Sets `client_reference_id = user id` and `metadata.plan_id`.
2. **`billing-webhook`** (no JWT — authenticated by Stripe **signature**, verified
   with HMAC-SHA256) — on `checkout.session.completed` /
   `customer.subscription.updated` / `.deleted`, it upserts the user's
   `subscriptions` row. This is the **only** place entitlement is written.

**Env required:** `STRIPE_SECRET_KEY` (create-checkout), `STRIPE_WEBHOOK_SECRET`
(billing-webhook), `APP_URL` (redirect targets). Point a Stripe webhook at the
`billing-webhook` URL for those three event types.

---

## Making yourself an admin

The dashboard is admin-only. Promote an account once, directly:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```
