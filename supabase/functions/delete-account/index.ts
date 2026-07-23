// =============================================================================
// delete-account
// Permanently deletes the signed-in user's account and ALL their data. This is
// the user's own right-to-erasure path for a privacy-first product.
//
// Order:
//   1. Purge their storage objects (audio, uploads, reports) — keyed by the
//      user id as the first path segment.
//   2. Delete the entities that DON'T cascade from the auth user (clubs, teams,
//      players use created_by ON DELETE SET NULL, so they'd orphan otherwise).
//   3. Delete the auth user, which cascades everything else: profile,
//      subscriptions, usage_events, events (+ notes, reflection, squad, result,
//      reports, player games), coach voice profile, learning state.
//
// verify_jwt = true — a user can only ever delete themselves (auth.getUser()).
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { serviceClient, userClient } from "../_shared/clients.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supa = userClient(req);
    const { data: auth } = await supa.auth.getUser();
    if (!auth?.user) return jsonResponse({ error: "Not signed in" }, 401);
    const userId = auth.user.id;

    const admin = serviceClient();

    // 1. Storage (best-effort — never block the deletion on a storage hiccup).
    for (const bucket of ["audio-recordings", "uploads", "reports"]) {
      try { await purgeUserStorage(admin, bucket, userId); } catch (_) { /* best-effort */ }
    }

    // 2. Owned entities that would orphan (created_by set null on user delete).
    await admin.from("players").delete().eq("created_by", userId);
    await admin.from("teams").delete().eq("created_by", userId);
    await admin.from("clubs").delete().eq("created_by", userId);

    // 3. The auth user — cascades the rest.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

// Recursively remove every object under the user's folder in a bucket.
async function purgeUserStorage(admin: SupabaseClient, bucket: string, userId: string): Promise<void> {
  async function walk(prefix: string): Promise<void> {
    const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    if (!data || data.length === 0) return;
    const files: string[] = [];
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if ((item as { id: string | null }).id === null) {
        await walk(path); // a folder
      } else {
        files.push(path);
      }
    }
    if (files.length) await admin.storage.from(bucket).remove(files);
  }
  await walk(userId);
}
