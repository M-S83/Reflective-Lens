# Coach subsystem: inventory of the work, and what is left to deploy

## 0. What this is and where it lives

**The port is done.** This work was originally committed to `M-S83/Nordic` by
mistake. All of it has since been cherry-picked into `M-S83/Reflective-Lens`,
which is the product repo and the only one that matters from here. The commit
hashes in section 1 are the original Nordic hashes, kept as provenance; the
equivalent commits live on the Reflective Lens working branch with the same
messages, in the same order.

The previously deployed backend (per the 23 Jul runbook) was at **7 migrations /
14 edge functions**. This work takes the codebase to **15 migrations / 16 edge
functions**, plus 5 new shared modules, frontend changes, new docs, and a
verification test suite.

**What is still outstanding:** re-deploy the backend so the live Supabase project
runs this code. See section 7 for the deploy steps and section 9 for the parts
that are deliberately unfinished.

> **Out of date from here on, in one important way.** This document was written
> before migration `0021`, and it describes the player subsystem as live and
> unfinished. It is neither: commit `1c5cc2c` withdrew the player journey, and
> the screens, the role chooser, the mode switch, `generate-player-summary` and
> the `player_report` branch of `generate-report` are all gone. What is left is
> dormant tables and enum values, kept because dropping them is irreversible.
> `CLAUDE.md` carries the current statement. Read that first, and read the
> counts below as historical: this file says 16 tests, and there are 37.

---

## 1. Everything that changed, by commit (oldest → newest)

Everything from `235c5ee` onward is this session's work.

| Commit | Summary |
|---|---|
| `235c5ee` | Apply entitlements, pricing, model tiering, cost guard (migrations 0008–0011 + frontend) |
| `485c6e0` | Drop em dashes from user-facing plan names + dashboard placeholders |
| `e78c925` | Account deletion: self-serve right to erasure (initial, immediate) |
| `4be4ce2` | Account deletion: 30-day recovery window (migration 0012 + purge cron) |
| `242c8fe` | Add system audit (`docs/system-audit.md`) — no code change |
| `bb7bd6c` | Harden coach reports: PII out of logs (F2), blank/wipe guards (F19/F20/F21) |
| `3f73475` | Revert F1 name-stripping (coach reports use player names as recorded) |
| `8a7e8b8` | Tranche 3 idempotency: disable insights (F9), dedup questions/reports (F10/F11), guard voice (F12) — migrations 0013, 0014 |
| `5ad3a6b` | F4: coach reflection engine — single-session, source-bounded, structured write-back |
| `f2dcd08` | F5: `event_attendance` is the canonical squad store |
| `d5ecb4b` | Under-18 name privacy: first names only + voice-note surname strip |
| `5472425` | RLS: reports owner-only (migration 0015), verified row-level privacy |
| `c349ce6` | F15: one `_shared/json.ts` (safeParse) |
| `92617cc` | F16: one `_shared/markdown.ts` report renderer (byte-identical) |
| `204eb89` | F17: one `_shared/crypto.ts` constant-time compare (+ closed cron timing gap) |
| `55ec67f` | F18: `model_config` authoritative, `MODELS` pinned fallback |
| `1ba5521` | F14: one `_shared/principles.ts` (MIRROR, NOT VERDICT) |
| `fd86bbe` | F24: report sends reflection text, not the whole row (coach) |
| `7576068` | F26: dedup `raw_transcript`/`summary` in reflection-questions (coach) |
| `fb6884c` | F25: period report groups notes by theme (no theme dropped) |
| `42ac169` | Add staging run checklist + seed (`docs/staging-run.md`, `docs/staging-seed.sql`) |
| `2ec7e8a` | F7: align "phase" to `phase_of_play` across the reports |

---

## 2. New migrations (apply these — they take the DB from 0007 → 0015)

- **0008_mode_entitlements.sql** — subscriptions become one row per (user, plan);
  `active_roles()`, `has_role()`, `start_trial(role)` (self-serve one-month trial,
  trialing only, once per role). A user can hold coach AND player independently.
- **0009_pricing.sql** — Coach £3.99 / Player £2.99 monthly; annual = 12 months
  less 25% (£35.91 / £26.91); MRR view learns the yearly term. (Plan names are
  dash-free: "Coach Monthly", "Coach Annual", etc.)
- **0010_model_config.sql** — `model_config` table (feature → model), seeded with
  current tiering (Haiku for high-volume, Sonnet for reader-facing reports).
  Authoritative at runtime; admin-managed.
- **0011_cost_guard.sql** — `over_budget_model` per feature, `is_over_budget(user)`,
  `analytics_user_budget` view. Guarded features downgrade only when the acting
  user is over their plan budget; reports stay protected.
- **0012_account_deletion_grace.sql** — `profiles.deletion_requested_at` /
  `deletion_scheduled_at`; `request_account_deletion()` (schedules 30 days out,
  idempotent) and `cancel_account_deletion()`.
- **0013_disable_insights.sql** — drops the `learn_insights_from_observation`
  trigger and clears the insights backlog. **Preserves** the `insights` table,
  the `insight_type` enum, and the `update-insights` generator (feature disabled,
  not deleted).
- **0014_report_change_detection.sql** — adds `reports.source_fingerprint`.
- **0015_reports_owner_only.sql** — replaces the reports read policy with
  owner-only (`created_by = auth.uid()`); the `report_access` sharing path no
  longer grants read access (ownership-only model; share by PDF).

All 15 migrations validated together on a throwaway PostgreSQL 16.

---

## 3. Edge functions

**New (bring the deployment from 14 → 16 functions):**
- **delete-account** — schedules the caller's own account for deletion in 30 days
  (returns the date). `verify_jwt = true`. Was immediate in `e78c925`, changed to
  scheduling in `4be4ce2`.
- **purge-due-accounts** — cron sweep (shared secret `PURGE_CRON_SECRET`) that hard
  deletes accounts whose window has passed (storage purge → orphan-prone
  clubs/teams/players → auth user cascade). `verify_jwt = false`.

**Changed:**
- **generate-report** — F4 rebuild: refuses on partial input (needs a reflection,
  422); coach prompt draws ONLY on what the coach said this session, single-session,
  no fabrication; aim checklist with `recorded`/`partly`/`stated_not_recorded`
  (aims kept, never dropped); folds the structured summary back into
  `reflections` (`what_went_well`, `what_did_not_work`, `action_points`,
  `suggested_next_focus`, `learning_evidence`, `hoped_to_see_review`); new coach
  `content_json` shape rendered by `coachMarkdown`. F11 change-detection via a
  coach-source-only fingerprint (regenerate only when the source changed; else
  return the existing report; regenerate in place, no duplicate rows). F2: never
  logs the model reply body. F5: roster reads `event_attendance` joined to
  `players`. Under-18: roster/stats use first names. F24: sends only the
  reflection text, not the whole row. **The `player_report` branch is unchanged.**
- **generate-period-report** — F19 blank-report guard; F5/under-18: players by
  first name (shirt read replaced by name map); F25: notes grouped by theme
  (`{theme, count, positive, concern, neutral, examples}`) instead of every note
  verbatim; F7: dropped the unused `capture_phase` read; F14 principle; F15/F16
  shared helpers.
- **enrich-reflection** — F20: never overwrites a good enriched summary with an
  empty reply; F14 principle.
- **review-intent** — F21: never wipes `hoped_to_see_review` on a failed parse;
  F10: dedups gap questions; F7: uses `phase_of_play`; F14 principle; F15 helper.
- **generate-reflection-questions** — F9: removed the insights consumer wire; F10:
  idempotent (returns existing questions rather than duplicating); F26: coach
  context dedups `raw_transcript`/`summary`; F14 principle (coach branch);
  F15 helper. **Player question branch unchanged.**
- **clean-observation** — F5: shirt attribution reads `event_attendance` +
  `players`; F14 principle; F15 helper.
- **update-voice-profile** — F12: no-op instead of nulling a good profile on an
  empty reply; F15/F17 helpers.
- **run-learning** — F9: no longer fans out to `update-insights`; F17:
  constant-time cron-secret compare.
- **transcribe-audio** — under-18: light surname strip on observation (voice-note)
  transcripts using the event's squad surnames.
- **billing-webhook** — upsert subscriptions on `(user_id, plan_id)`; F17 helper.
- **clients.ts (shared)** — `resolveModel`/`model_config`/`is_over_budget` +
  budget cache; `MODELS` documented as fallback (F18); uses shared `timingSafeEqual`.
- **config.toml** — registers `delete-account` (JWT) and `purge-due-accounts`
  (no JWT).

---

## 4. New shared modules (`supabase/functions/_shared/`)

- **names.ts** — `isUnder18(age_group)` (U18 and below protected), `safeName`,
  `safeNameMap` (first name only, last initial to disambiguate), `stripSurnames`.
- **json.ts** — `firstJsonObject` / `firstJsonArray` (replaces copy-pasted safeParse).
- **markdown.ts** — `renderReport` + `MdBlock` (one report renderer).
- **crypto.ts** — `timingSafeEqual` (one constant-time compare).
- **principles.ts** — `MIRROR_NOT_VERDICT` canonical constant.

---

## 5. Frontend (`web/src/`)

New/changed with the entitlements + account-deletion + dashboard work (commits
`235c5ee`, `485c6e0`, `e78c925`, `4be4ce2`):
- New: `lib/entitlements.tsx`, `lib/analytics.ts`, `screens/ChooseRole.tsx`,
  `screens/Dashboard.tsx`, `components/DeleteAccount.tsx`.
- Changed: `App.tsx` (entitlement-gated modes, renew banner/wall, hidden Owner
  tab), `components/ModeSwitch.tsx` (only shows when both roles held), `main.tsx`
  (EntitlementProvider), `lib/db.ts` (deletion + edit/delete helpers),
  `screens/Home.tsx` + `screens/PlayerHome.tsx` (DeleteAccount danger zone).

NOTE: F4 changed the coach report `content_json` shape. The app renders
`content_markdown`, so viewing is unaffected, but any UI that reads report
`content_json` directly should expect the new coach keys. The frontend was
treated as "rebuild later" this session.

---

## 6. New docs

- `docs/system-audit.md` — the full pipeline/contracts/PII audit (findings F1–F27).
- `docs/staging-run.md` — executable end-to-end staging checklist.
- `docs/staging-seed.sql` — one realistic coach scenario for the staging read.
- `docs/handoff-to-cowork.md` — this file.

---

## 7. Verification (a runnable check ships with every change)

In `supabase/functions/_tests/`. Node checks: `node <file>.mjs`. PG16 checks:
`bash <file>.sh` (needs a local PostgreSQL 16). All currently pass.

- `step12-guards.mjs`, `tranche3-idempotency.mjs`, `f4-reflection-engine.mjs`,
  `names-privacy.mjs`, `f14-principles.mjs`, `f15-json.mjs`, `f16-markdown.mjs`,
  `f17-crypto.mjs`, `f18-model-config.mjs`, `f24-report-tokens.mjs`,
  `f25-period-buckets.mjs`, `f26-questions-tokens.mjs`, `f7-phase.mjs`
- PG16: `tranche3-db.sh` (insights trigger off), `f5-squad-db.sh` (attribution),
  `rls-privacy-db.sh` (cross-coach isolation).

---

## 8. Conventions that MUST survive (including any Lovable/frontend rebuild)

- **Mirror, not verdict.** Output only reflects what the coach/player said; never
  grades, judges, or teaches. Canonical wording in `_shared/principles.ts`.
- **Coach and player never mix.** Separate spaces, no shared data.
- **Ownership-only.** A coach reads only their own data; no in-app sharing (PDF
  export only). Enforced by RLS (0015).
- **Under-18 → first names only** in anything sent to a model or shown player-side
  (last initial to disambiguate). Keyed off team age group; no DOB collected.
- **"Game changer"**, never "sub"/"came on". **British English, no em/en dashes.**
- **Do NOT regenerate the schema or edge functions from a tool.** The backend is
  the source of truth; build UI against it, don't recreate it.

---

## 9. State / what is NOT done

- **Staging read still pending** — the prompt/token changes (F14, F24, F25, F26)
  are proven structurally by the checks but NOT yet eyeballed on real model output
  end to end. Run `docs/staging-run.md` and read the two reports before pilot.
- **Player subsystem** — untouched this pass; needs the same treatment (F4-style
  structuring, under-18 rule, F14 principle) when worked on.
- **Insights / linked open questions** — disabled (0013), to be rebuilt as
  cross-store linked questions (the #1 post-dispatch build).
- **F7 decision applied**: "phase" = `phase_of_play` everywhere.

---

## 10. Deploy steps to bring the live backend current (after porting)

```bash
supabase link --project-ref <YOUR_REF>
supabase db push          # applies 0008–0015 on top of the existing 0001–0007
./scripts/deploy.sh       # sets secrets + redeploys all 16 functions
```
`scripts/deploy.sh` now also needs `PURGE_CRON_SECRET` in `.env`, and deploys
`delete-account` (JWT) + `purge-due-accounts` (no JWT). `supabase/go-live.sql`
gained a daily purge-accounts cron alongside the learning sweep.
