// Shared client helpers for Edge Functions (Deno runtime).
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// A client scoped to the *calling user* — RLS applies. Use for reads/writes
// that should respect the caller's permissions.
export function userClient(req: Request): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    },
  );
}

// A service-role client — bypasses RLS. Use only for trusted server-side
// writes (e.g. writing AI-generated results back) after you have verified the
// caller is allowed to touch the row.
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// -----------------------------------------------------------------------------
// Model tiering — the single biggest lever on cost-to-run.
//
// Most AI work here is light (cleaning a note, drafting a few questions, learning
// a voice) and does not need a frontier model. We reserve the mid-tier (Sonnet)
// for the writing that the user actually reads as a finished report, and use the
// cheap tier (Haiku) for everything else. Nothing defaults to Opus any more.
// See docs/cost-model.md for the per-user cost breakdown behind these choices.
// -----------------------------------------------------------------------------
export const MODELS = {
  cleanObservation: "claude-haiku-4-5", // tidy a raw note — cheap, high volume
  reflectionQuestions: "claude-haiku-4-5", // draft a few short questions
  reviewIntent: "claude-haiku-4-5", // match aims against notes
  voiceProfile: "claude-haiku-4-5", // learn how the coach writes
  teamSheet: "claude-haiku-4-5", // structure a roster into JSON
  enrichReflection: "claude-sonnet-5", // reader-facing prose
  report: "claude-sonnet-5", // reader-facing report
  periodReport: "claude-sonnet-5", // reader-facing report
  playerSummary: "claude-sonnet-5", // reader-facing summary
} as const;

// USD per 1,000,000 tokens (Anthropic list price, cached 2026-06-24). Kept here
// so cost is computed at the point of use and stored per event for analytics.
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-opus-4-7": { in: 5, out: 25 },
  "claude-opus-4-6": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

// OpenAI Whisper (whisper-1) is a flat $0.006 / minute of audio.
export const WHISPER_USD_PER_MINUTE = 0.006;

// Cost of a single Claude call, in USD, from its token usage.
export function aiCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? PRICES["claude-opus-4-8"];
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
}

// A single tracked usage row. Cost/token fields are optional (engagement events
// have none). See migration 0004 for the table.
export interface UsageRow {
  user_id: string;
  event_name: string; // 'ai_call' | 'transcription' | 'pdf_export' | ...
  feature?: string | null; // which function/feature produced it
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  audio_seconds?: number | null;
  cost_usd?: number | null;
  club_id?: string | null;
  team_id?: string | null;
  metadata?: Record<string, unknown>;
}

// Best-effort usage logging. Analytics must NEVER break the user's request, so
// any failure here is swallowed.
export async function logUsage(admin: SupabaseClient, row: UsageRow): Promise<void> {
  try {
    await admin.from("usage_events").insert(row);
  } catch (_) {
    // ignore — logging is best-effort
  }
}

// -----------------------------------------------------------------------------
// Actor resolution — who is this call acting for?
//
// The learning passes (update-insights, update-voice-profile) run in two modes:
//   • a signed-in user recomputing their own learning, or
//   • the nightly sweep (run-learning) recomputing a due user's learning on their
//     behalf, authenticated by a shared cron secret rather than a user JWT.
// Both resolve to a user id + a client that can read that user's rows.
// -----------------------------------------------------------------------------
export interface Actor {
  userId: string;
  read: SupabaseClient; // RLS-scoped for a user; service (admin) in cron mode
  admin: SupabaseClient;
  viaCron: boolean;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function resolveActor(req: Request): Promise<Actor | null> {
  const admin = serviceClient();
  const secret = Deno.env.get("LEARNING_CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  const target = req.headers.get("x-target-user");

  // Cron/sweep path: trusted server call for a specific user.
  if (secret && provided && target && constantTimeEqual(provided, secret)) {
    return { userId: target, read: admin, admin, viaCron: true };
  }

  // Normal path: a signed-in user acting for themselves.
  const supa = userClient(req);
  const { data: auth } = await supa.auth.getUser();
  if (!auth?.user) return null;
  return { userId: auth.user.id, read: supa, admin, viaCron: false };
}

// Record one learning pass to the visible ledger and clear that user's pending
// flag so the same input isn't re-learned next sweep. Best-effort.
export async function recordLearning(
  admin: SupabaseClient,
  row: { user_id: string; kind: "voice" | "insights"; inputs_seen?: number; items_changed?: number; summary?: string },
): Promise<void> {
  try {
    await admin.from("learning_runs").insert(row);
    await admin.rpc("clear_learning_pending", { target: row.user_id, which: row.kind });
  } catch (_) {
    // ignore — the learning still happened; only the bookkeeping failed
  }
}

// Minimal Anthropic Messages API helper.
//
// Pass `feature` + `log` and the call's token cost is recorded to usage_events
// automatically (best-effort). `model` should come from MODELS above — it falls
// back to Opus only if a caller forgets, so cost is never silently understated.
export async function callClaude(opts: {
  system?: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  feature?: string;
  log?: {
    admin: SupabaseClient;
    userId: string;
    clubId?: string | null;
    teamId?: string | null;
  };
}): Promise<string> {
  const model = opts.model ?? "claude-opus-4-8";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();

  // Record what this call cost, for the usage dashboard and per-user cost view.
  if (opts.log) {
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    await logUsage(opts.log.admin, {
      user_id: opts.log.userId,
      event_name: "ai_call",
      feature: opts.feature ?? "ai_call",
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: aiCostUsd(model, inputTokens, outputTokens),
      club_id: opts.log.clubId ?? null,
      team_id: opts.log.teamId ?? null,
    });
  }

  return data.content?.[0]?.text ?? "";
}
