// =============================================================================
// send-trial-reminders
// Daily sweep that tells a coach their free month is nearly up: once at 7 days
// left, once at 1 day left. Invoked on a schedule (pg_cron, see
// supabase/go-live.sql), never by a user.
//
// Auth: shared secret (TRIAL_CRON_SECRET) compared in constant time, matching
// run-learning and purge-due-accounts. verify_jwt = false in config.toml.
//
// IDEMPOTENCY. email_deliveries has unique (user_id, kind), and this inserts the
// row BEFORE sending. Two sweeps in the same day, or a retry after a timeout,
// therefore cannot email a coach twice: the second insert loses the race and
// that coach is skipped. If the send then fails, the row is deleted again so the
// next sweep retries. The failure mode this ordering picks is "possibly emailed
// twice only if the delete fails after a successful send", which is far better
// than the alternative ordering, where any crash between send and record means
// the coach is emailed again every single day.
//
// Body (optional): { dry_run?: boolean, max_users?: number }
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/clients.ts";
import { timingSafeEqual } from "../_shared/crypto.ts";
import { emailConfigured, sendEmail, trialReminderEmail } from "../_shared/email.ts";

const TRIAL_DAYS = 30;
const DAY_MS = 86_400_000;

// The two milestones we write to. Kind is what makes the send idempotent, so
// these strings are a contract with email_deliveries: never renumber them, or
// every coach gets the message again.
const MILESTONES = [
  { daysLeft: 7, kind: "trial_7_day" },
  { daysLeft: 1, kind: "trial_1_day" },
];

// Same arithmetic as public.trial_days_left (0017). Kept identical on purpose:
// if the two ever disagree, a coach gets an email that contradicts the number on
// their own account screen.
function daysLeft(trialStartedAt: string, now: number): number {
  const end = new Date(trialStartedAt).getTime() + TRIAL_DAYS * DAY_MS;
  return Math.max(0, Math.ceil((end - now) / DAY_MS));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = Deno.env.get("TRIAL_CRON_SECRET");
    const provided = req.headers.get("x-cron-secret");
    if (!secret || !provided || !timingSafeEqual(provided, secret)) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // Not an error: a project can be fully deployed before an email provider is
    // chosen. Return 200 so a daily schedule does not log a failure forever.
    if (!emailConfigured()) {
      console.warn("send-trial-reminders: no email provider configured, skipping");
      return jsonResponse({ ok: true, sent: 0, skipped: "email not configured" });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body.dry_run);
    const limit = Math.min(Number(body.max_users ?? 500), 2000);

    const admin = serviceClient();
    const now = Date.now();
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");

    // Only accounts whose trial START could put them on a milestone today, so
    // the sweep reads a bounded slice rather than every profile ever created.
    // 7 days left is 23 days in, 1 day left is 29, plus a day of slack either
    // side for a sweep that runs late.
    const windowStart = new Date(now - (TRIAL_DAYS + 1) * DAY_MS).toISOString();
    const windowEnd = new Date(now - (TRIAL_DAYS - 8) * DAY_MS).toISOString();

    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, email, full_name, trial_started_at, deletion_scheduled_at")
      .gte("trial_started_at", windowStart)
      .lte("trial_started_at", windowEnd)
      .limit(limit);
    if (error) return jsonResponse({ error: error.message }, 500);

    // Anyone already paying does not need chasing about a free month.
    const { data: subs } = await admin
      .from("subscriptions").select("user_id, status");
    const paying = new Set(
      ((subs ?? []) as { user_id: string; status: string }[])
        .filter((s) => s.status === "active" || s.status === "past_due")
        .map((s) => s.user_id),
    );

    let sent = 0, skipped = 0;
    const failed: string[] = [];

    for (const p of (profiles ?? []) as Profile[]) {
      // An account on its way out is not a sales opportunity.
      if (!p.email || !p.trial_started_at || p.deletion_scheduled_at) { skipped++; continue; }
      if (paying.has(p.id)) { skipped++; continue; }

      const left = daysLeft(p.trial_started_at, now);
      const milestone = MILESTONES.find((m) => m.daysLeft === left);
      if (!milestone) { skipped++; continue; }

      if (dryRun) { sent++; continue; }

      // Claim the send first. A duplicate key here means another run already
      // has it, which is success, not failure.
      const { error: claimErr } = await admin
        .from("email_deliveries")
        .insert({ user_id: p.id, kind: milestone.kind });
      if (claimErr) { skipped++; continue; }

      try {
        const { subject, html } = trialReminderEmail({
          // First name only, consistent with the under-18 rule elsewhere, and
          // friendlier than a full name in a greeting.
          name: p.full_name ? p.full_name.trim().split(/\s+/)[0] : null,
          daysLeft: left,
          appUrl,
        });
        await sendEmail({ to: p.email, subject, html });
        sent++;
      } catch (_e) {
        // Release the claim so the next sweep tries again. Never log the address.
        await admin.from("email_deliveries")
          .delete().eq("user_id", p.id).eq("kind", milestone.kind);
        failed.push(p.id);
      }
    }

    return jsonResponse({ ok: true, sent, skipped, failed: failed.length, dry_run: dryRun });
  } catch (e) {
    // Logged as well as returned. The response body only helps if the caller
    // reads it, and a fire-and-forget invoke does not, so a failing function
    // showed a boot in the dashboard and then nothing at all, which looks
    // exactly like one that worked.
    console.error(`send-trial-reminders failed:`, e);
    return jsonResponse({ error: String(e) }, 500);
  }
});

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  trial_started_at: string | null;
  deletion_scheduled_at: string | null;
}
