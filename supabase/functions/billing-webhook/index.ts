// =============================================================================
// billing-webhook
// Keeps `subscriptions` in sync with Stripe. Stripe is the source of truth for
// billing; this function mirrors the state we need for entitlement
// (has_active_subscription()) into our own table.
//
// This is the ONE place a user's paid status is written. Clients never set it —
// RLS blocks that — so entitlement can't be forged from the app.
//
// Setup (Stripe dashboard → Developers → Webhooks):
//   • Send events: checkout.session.completed, customer.subscription.updated,
//     customer.subscription.deleted
//   • Set the endpoint to this function's URL
//   • Put the signing secret in the STRIPE_WEBHOOK_SECRET env var
//
// verify_jwt = false in config.toml — Stripe does not send a Supabase JWT; we
// authenticate the request by verifying Stripe's signature instead.
// =============================================================================
import { serviceClient } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const sig = req.headers.get("stripe-signature");
  const body = await req.text(); // raw body is required for signature verification

  if (!secret || !sig || !(await verifyStripeSignature(body, sig, secret))) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  const admin = serviceClient();
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // The subscribe flow (create-checkout) sets client_reference_id = user id
        // and metadata.plan_id = our plan.
        const s = event.data.object;
        const userId = s.client_reference_id;
        const planId = s.metadata?.plan_id;
        if (userId && planId) {
          await admin.from("subscriptions").upsert({
            user_id: userId,
            plan_id: planId,
            status: "active",
            stripe_customer_id: s.customer ?? null,
            stripe_subscription_id: s.subscription ?? null,
          }, { onConflict: "user_id" });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const status = event.type === "customer.subscription.deleted"
          ? "canceled"
          : (sub.status ?? "active");
        // Match on the Stripe subscription id we stored at checkout.
        await admin.from("subscriptions")
          .update({
            status,
            cancel_at_period_end: sub.cancel_at_period_end ?? false,
            current_period_start: unixToIso(sub.current_period_start),
            current_period_end: unixToIso(sub.current_period_end),
          })
          .eq("stripe_subscription_id", sub.id);
        break;
      }
      default:
        // Ignore everything else.
        break;
    }
  } catch (e) {
    // Log and 500 so Stripe retries.
    console.error("billing-webhook error", e);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "content-type": "application/json" },
  });
});

// --- Stripe signature verification (HMAC-SHA256, no SDK) ---------------------
// Header format: "t=<timestamp>,v1=<hex signature>". Signed payload is
// `${t}.${rawBody}`, HMAC'd with the webhook signing secret.
async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts: Record<string, string> = {};
  for (const kv of header.split(",")) {
    const [k, v] = kv.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, v1);
}

// Constant-time comparison to avoid leaking the signature via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function unixToIso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

// --- Minimal shape of the Stripe events we handle ----------------------------
interface StripeEvent {
  type: string;
  data: {
    object: {
      // checkout.session.completed
      client_reference_id?: string;
      metadata?: { plan_id?: string };
      customer?: string;
      subscription?: string;
      // customer.subscription.*
      id?: string;
      status?: string;
      cancel_at_period_end?: boolean;
      current_period_start?: number;
      current_period_end?: number;
    };
  };
}
