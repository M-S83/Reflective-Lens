// =============================================================================
// purge-due-accounts
// The irreversible half of account deletion. Invoked on a daily schedule
// (pg_cron — see supabase/go-live.sql), it finds every account whose 30-day
// recovery window has passed (profiles.deletion_scheduled_at <= now) and hard
// deletes it and all its data.
//
// Auth: not a user endpoint. Protected by a shared secret (PURGE_CRON_SECRET);
// verify_jwt = false in config.toml so the scheduler can reach it.
//
// Per account, in order:
//   1. Purge their storage objects (audio, uploads, reports) — keyed by user id
//      as the first path segment.
//   2. Delete the entities that DON'T cascade from the auth user (clubs, teams,
//      players use created_by ON DELETE SET NULL, so they'd orphan otherwise).
//   3. Delete the auth user, which cascades everything else: profile,
//      subscriptions, usage_events, events (+ notes, reflection, squad, result,
//      reports, player games), coach voice profile, learning state.
//
// Body (optional): { max_users?: number }
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/clients.ts";
import { timingSafeEqual } from "../_shared/crypto.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = Deno.env.get("PURGE_CRON_SECRET");
    const provided = req.headers.get("x-cron-secret");
    if (!secret || !provided || !timingSafeEqual(provided, secret)) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.max_users ?? 100), 500);

    const admin = serviceClient();

    // Due = the recovery window has passed. Service role bypasses RLS.
    const { data: due, error } = await admin
      .from("profiles")
      .select("id")
      .not("deletion_scheduled_at", "is", null)
      .lte("deletion_scheduled_at", new Date().toISOString())
      .limit(limit);
    if (error) return jsonResponse({ error: error.message }, 500);

    let purged = 0;
    const failed: string[] = [];
    for (const row of (due ?? []) as { id: string }[]) {
      try {
        await hardDeleteUser(admin, row.id);
        purged++;
      } catch (_) {
        failed.push(row.id);
      }
    }

    return jsonResponse({ ok: true, due: due?.length ?? 0, purged, failed: failed.length });
  } catch (e) {
    // Logged as well as returned. The response body only helps if the caller
    // reads it, and a fire-and-forget invoke does not, so a failing function
    // showed a boot in the dashboard and then nothing at all, which looks
    // exactly like one that worked.
    console.error(`purge-due-accounts failed:`, e);
    return jsonResponse({ error: String(e) }, 500);
  }
});

// Irreversibly delete one user and all their data.
async function hardDeleteUser(admin: SupabaseClient, userId: string): Promise<void> {
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
  if (error) throw new Error(error.message);
}

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
