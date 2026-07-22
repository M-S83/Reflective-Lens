// =============================================================================
// run-learning
// The heartbeat that makes the app learn from itself continuously. Invoked on a
// schedule (pg_cron — see docs/continuous-learning.md), it finds every user with
// new input the app hasn't learned from yet (`learning_due`) and refreshes their
// voice profile and/or trend insights. Each pass records a `learning_runs` row
// and clears that user's pending flag, so the next sweep only touches what's
// actually changed — cheap at rest, current at all times.
//
// Auth: not a user endpoint. Protected by a shared secret (LEARNING_CRON_SECRET);
// verify_jwt = false in config.toml so the scheduler can reach it. It calls the
// two learning functions with the service-role key (to clear their JWT gateway)
// plus the same cron secret + target user (so they act for that user).
//
// Body (optional): { max_users?: number }
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = Deno.env.get("LEARNING_CRON_SECRET");
    const provided = req.headers.get("x-cron-secret");
    if (!secret || provided !== secret) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.max_users ?? 200), 500);

    const admin = serviceClient();
    const { data: due, error } = await admin.rpc("learning_due", { max_rows: limit });
    if (error) return jsonResponse({ error: error.message }, 500);

    const base = Deno.env.get("FUNCTIONS_BASE_URL") ??
      `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const call = async (fn: string, userId: string): Promise<boolean> => {
      try {
        const r = await fetch(`${base}/${fn}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${serviceKey}`, // satisfies the gateway's JWT check
            "x-cron-secret": secret,
            "x-target-user": userId,
          },
          body: "{}",
        });
        return r.ok;
      } catch {
        return false;
      }
    };

    // Sequential fan-out — gentle on provider rate limits at grassroots scale.
    let voiceRuns = 0, insightRuns = 0;
    for (const u of (due ?? []) as { user_id: string; need_voice: boolean; need_insights: boolean }[]) {
      if (u.need_voice && await call("update-voice-profile", u.user_id)) voiceRuns++;
      if (u.need_insights && await call("update-insights", u.user_id)) insightRuns++;
    }

    return jsonResponse({
      ok: true,
      due: due?.length ?? 0,
      voice_runs: voiceRuns,
      insight_runs: insightRuns,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
