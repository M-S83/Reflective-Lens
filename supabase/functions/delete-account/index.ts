// =============================================================================
// delete-account
// Schedules the signed-in user's account for deletion in 30 days (a recovery
// window), rather than wiping it immediately. Until the scheduled date the user
// can undo (cancel_account_deletion) and keep everything. The irreversible hard
// delete is done later by the purge-due-accounts sweep once the date has passed.
//
// verify_jwt = true — a user can only ever schedule their OWN account, because
// request_account_deletion() acts on auth.uid() from their token.
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { userClient } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supa = userClient(req);
    const { data: auth } = await supa.auth.getUser();
    if (!auth?.user) return jsonResponse({ error: "Not signed in" }, 401);

    // Acts on the caller's own row (auth.uid()); returns the scheduled date.
    const { data, error } = await supa.rpc("request_account_deletion");
    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ ok: true, scheduled_for: data });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
