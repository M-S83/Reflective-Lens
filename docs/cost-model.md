# Cost to run — Reflective Lens

_What it costs to run the AI + transcription behind one user, and the levers that
move that number. All figures are provider list prices; local currency uses
≈ $1.27 / £1._

The only meaningful **variable** cost per user is what we send to two providers:

| Provider | What for | Price (list) |
|---|---|---|
| Anthropic — Claude Haiku 4.5 | cleaning notes, drafting questions, intent review, voice profile | $1 / 1M input · $5 / 1M output |
| Anthropic — Claude Sonnet 5 | the reports & summaries a user actually reads | $3 / 1M input · $15 / 1M output (intro $2 / $10 to 2026‑08‑31) |
| OpenAI — Whisper (`whisper-1`) | voice → text | $0.006 / minute of audio |

Everything else (Postgres, Auth, Storage, Edge Functions) is a **flat** platform
cost, covered below.

> **The single biggest lever is which model each function uses.** The backend
> used to default every AI call to Opus 4.8 ($5 / $25). It now tiers models
> (`functions/_shared/clients.ts` → `MODELS`): cheap, high‑volume work goes to
> Haiku, and only the reader‑facing prose goes to Sonnet. Nothing uses Opus.
> That change alone roughly **halves** the cost below.

---

## What one action costs

Every AI call now records its own token cost to `usage_events` (see
`docs/analytics.md`), so these estimates are checkable against real data once
live. Typical sizes:

| Function | Model | ~in / out tokens | Cost / call |
|---|---|---:|---:|
| clean-observation | Haiku | 500 / 150 | $0.0011 |
| generate-reflection-questions | Haiku | 1,500 / 400 | $0.0035 |
| review-intent | Haiku | 800 / 300 | $0.0023 |
| update-voice-profile | Haiku | 2,000 / 400 | $0.0040 |
| enrich-reflection | Sonnet | 2,000 / 600 | $0.0150 |
| generate-report | Sonnet | 3,000 / 1,200 | $0.0270 |
| generate-period-report | Sonnet | 5,000 / 1,500 | $0.0375 |
| generate-player-summary | Sonnet | 3,000 / 1,000 | $0.0240 |
| transcribe (per min of audio) | Whisper | — | $0.0060 |

_(Sonnet rows at standard price; ~⅓ lower during the intro period.)_

---

## Per **coach**, per week / month / season

A **typical active coach week**: 3 sessions (2 training + 1 match), ~8 live notes
each, a reflection + report per session, one weekly team report, ~10 min of
voice, an occasional voice‑profile refresh.

| | Tiered (Haiku + Sonnet) — **what we run** | If everything were Opus 4.8 |
|---|---:|---:|
| **Per week** | **≈ $0.28** | ≈ $0.59 |
| **Per month** (×4.33) | **≈ $1.20** | ≈ $2.55 |
| **Per season** (38 active wks) | **≈ $10.50** | ≈ $22.40 |

Spread by how heavily a coach uses it (tiered, per week):

| Coach | Roughly | Per week | Per month | Per season |
|---|---|---:|---:|---:|
| Light | 1 session/wk, few notes | ≈ $0.10 | ≈ $0.43 | ≈ $3.80 |
| **Typical** | 3 sessions/wk | **≈ $0.28** | **≈ $1.20** | **≈ $10.50** |
| Heavy | 5 sessions/wk, lots of voice | ≈ $0.47 | ≈ $2.05 | ≈ $18.00 |

## Per **player**, per week / month / season

A player is much lighter — one self‑reflection per game, the odd voice note, a
weekly summary. Tiered:

| | Per week | Per month | Per season |
|---|---:|---:|---:|
| **Typical player** | ≈ $0.09 | ≈ $0.38 | ≈ $3.30 |

---

## Platform (flat) cost

Supabase Pro is **$25 / month flat** and comfortably carries hundreds of
grassroots users (Postgres, Auth, 100 GB storage, Edge Function invocations).
Storage grows with saved audio + PDFs — budget a few pence per active user per
month. So the fixed platform cost **per user falls as you grow**: at 100 users
it's ~$0.25/user/month; at 500, ~$0.05.

**All‑in, per typical coach:** roughly **$1.20 AI + a few cents platform ≈
$1.30–1.50 / month**.

---

## Does the pricing work?

| Plan | Price | ≈ USD | Typical cost to run | Gross margin |
|---|---|---:|---:|---:|
| Coach — Monthly | £7.99 / mo | $10.15 | ~$1.30 | **~87%** |
| Coach — Season | £59.99 / season | $76 | ~$10.50 | **~86%** |
| Player — Monthly | £2.99 / mo | $3.80 | ~$0.40 | **~89%** |

Even a **heavy** coach ($2/mo) stays above 80% margin. The plans carry their own
cost comfortably; the seed catalogue in `0004_usage_analytics.sql` stores a
soft per‑plan `ai_budget_usd` ceiling so margin can be watched per user in the
dashboard and any runaway account flagged.

---

## Further levers (beyond model tiering)

Applied in rough order of value:

1. **Prompt caching** (~0.1× on cached input). The system prompts and the coach's
   voice profile are sent on almost every call — caching them cuts input cost on
   the high‑volume note‑cleaning path substantially. _Not yet enabled._
2. **Batch API** (50% off) for anything not real‑time — period reports, player
   summaries, voice‑profile, insight detection. Run them overnight as a batch.
3. **Cheaper transcription** — `gpt-4o-mini-transcribe` is ~$0.003/min (half
   Whisper). Worth an A/B on transcription quality for grassroots audio.
4. **Debounce background jobs** — voice‑profile and insight passes run on a
   cadence (or after _N_ new notes), not on every write, so they don't scale
   linearly with note volume.

Stacking caching + batch on top of the current tiering would take the typical
coach from ~$1.20 toward **~$0.70–0.80 / month**.

---

_Prices cached 2026‑06‑24 (Anthropic) and confirmed 2026‑07 (Whisper). Token
sizes are estimates; the `usage_events` table records the real numbers per call,
so this model should be re‑checked against live data after launch._
