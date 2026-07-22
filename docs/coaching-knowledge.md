# Coaching knowledge base

What grounds the app's reflection in real coaching pedagogy, so its nudges sound
like a thoughtful coach developer — not a generic chatbot — while staying true to
**mirror, not verdict**.

> **This is knowledge for the *system*, not curriculum for the coach.** It shapes
> how the app listens, asks and organises — behind the reflective surface. The
> coach does the reflecting; the app never teaches these frameworks *at* them,
> names a model back to them, or grades them against one. The prompt bank becomes
> *open questions in the coach's own words*; the taxonomy is *internal* bucketing;
> the frameworks are *never surfaced* to the coach. If any of it ever reads as
> instruction or a verdict, it has crossed the line.

## Source & provenance

Distilled from England Football's *Coachcast* series (22 episodes), covering
coaching behaviour, language, communication, effective coaching, coach
development and reflection. The content is **paraphrased / non-verbatim** — it's
principles, frameworks and original prompts, not transcript — so it is safe to
embed. Official transcripts (free) live on the England Football Community.

## What's stored (migration 0006)

Reference data — every signed-in user reads it; only an admin edits it (RLS).

| Table | Holds | Used by |
|---|---|---|
| `coaching_frameworks` | ~50 named models (Four Corners, STEP, the £10/coins challenge, "once/twice/three times", GOOD, ABC, three Ts, …) | surfacing/tagging; reference |
| `reflection_prompts` | a grouped bank of open reflective questions (Self-awareness, Communication & language, Intervention & delivery, Relationships & behaviour, Practice design, Impact & feelings) + a **10-10-10** cadence set | `generate-reflection-questions` |
| `coaching_tags` | ~53 canonical observation tags | `clean-observation` |

## How it grounds the AI

- **Reflection questions.** For a *coach* reflection, `generate-reflection-questions`
  pulls a group-spread sample of the prompt bank (varied per reflection) and gives
  it to the model as grounding: _draw on and adapt these real coach-reflection
  questions, rephrased in the coach's voice; prefer them over generic ones; keep
  them open — never judgement._ So the nudges are grounded in England-Football
  pedagogy **and** re-voiced through the coach's own `coach_voice_profile`, and
  still only appear where the reflection is thin. (Players keep their own personal
  open questions — the coach bank isn't imposed on them.)
- **Observation tags.** `clean-observation` is given the canonical taxonomy and
  told to prefer a canonical tag where one fits. That means the self-learning loop
  (trend detection in `update-insights`) buckets on a **consistent** vocabulary
  instead of drifting synonyms — "losing it under press" and "pressed too easily"
  land on the same theme.

Both loaders (`_shared/knowledge.ts`) cache the tables at module scope, so a warm
function instance reads them once and reuses them — negligible cost.

## The 10-10-10 cadence

Three prompts carry a `cadence` (`10m` / `10h` / `10d`) — the idea that different
insights surface 10 minutes, 10 hours and 10 days after a session. The frontend
can use these to schedule three light reflection touch-points after an event
(the app already has the scheduling backbone from `run-learning`). Not asked
mid-reflection; surfaced on their own timeline.

## Future direction — optional guidance on a persistent struggle

If the self-learning loop shows a theme *genuinely persisting* — still recurring
after the coach has been reflecting on it, not a one-off — the app could offer an
optional link to specific guidance (a Coachcast episode, an FA resource, the
relevant framework). This stays a mirror, not a verdict, only if it keeps three
guardrails:

- **Pull, not push** — the coach opens it if they want it; it is never popped up
  as "you're getting this wrong."
- **Only on a persistent, coach-surfaced pattern** — the theme came from their own
  notes and is *still* recurring across cycles; the app never decides a topic is a
  weakness on its own.
- **An offer, dismissible** — "this has kept coming up — if it'd help, here's
  something on it," never a grade or an instruction.

The pieces already exist: `update-insights` detects recurrence (and carries a
`reflective_prompt`); "still struggling" is that recurrence persisting. The wiring
would be small — an optional `resource_url` on `coaching_frameworks` (or a
tag→guidance map), surfaced only when an insight persists. **Not built yet** —
deferred by design until it's wanted.

## Editing the content

It's plain reference data. An admin can refine a prompt, add a framework, or
extend the taxonomy directly (or re-seed from an updated knowledge base) — no
schema change needed, and the change flows into the next AI call once the warm
caches recycle.
