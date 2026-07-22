// =============================================================================
// create-checkout
// Starts a subscription. Creates a Stripe Checkout Session for the chosen plan
// and returns its URL for the client to redirect to. On successful payment,
// Stripe calls billing-webhook, which is what actually flips the user's
// subscription to active — this function never writes entitlement itself.
//
// Body: { plan_id: string, success_url?: string, cancel_url?: string }
//
// Requires STRIPE_SECRET_KEY. verify_jwt = true — only a signed-in user can
// start their own checkout.
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { userClient } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return jsonResponse({ error: "Billing is not configured" }, 500);

    const supa = userClient(req);
    const { data: auth } = await supa.auth.getUser();
    if (!auth?.user) return jsonResponse({ error: "Not authenticated" }, 401);

    const { plan_id, success_url, cancel_url } = await req.json();
    if (!plan_id) return jsonResponse({ error: "Missing plan_id" }, 400);

    // Read the plan from our catalogue (RLS lets any signed-in user read active plans).
    const { data: plan, error } = await supa
      .from("plans").select("*").eq("id", plan_id).single();
    if (error || !plan) return jsonResponse({ error: "Unknown plan" }, 404);
    if (plan.price_pence <= 0) return jsonResponse({ error: "This plan has no checkout" }, 400);

    const appUrl = Deno.env.get("APP_URL") ?? "";
    // A 'month' plan is a recurring subscription; a 'season'/'once' plan is a
    // single up-front payment.
    const recurring = plan.interval === "month";

    // Build the Stripe Checkout Session (form-encoded REST — no SDK needed).
    const form = new URLSearchParams();
    form.set("mode", recurring ? "subscription" : "payment");
    form.set("success_url", success_url ?? `${appUrl}/billing/success`);
    form.set("cancel_url", cancel_url ?? `${appUrl}/billing/cancel`);
    form.set("client_reference_id", auth.user.id); // billing-webhook reads this
    form.set("metadata[plan_id]", plan.id);
    if (auth.user.email) form.set("customer_email", auth.user.email);
    form.set("line_items[0][quantity]", "1");
    form.set("line_items[0][price_data][currency]", plan.currency);
    form.set("line_items[0][price_data][product_data][name]", plan.name);
    form.set("line_items[0][price_data][unit_amount]", String(plan.price_pence));
    if (recurring) {
      form.set("line_items[0][price_data][recurring][interval]", "month");
    }

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    if (!res.ok) {
      return jsonResponse({ error: `Stripe error: ${await res.text()}` }, 502);
    }
    const session = await res.json();
    return jsonResponse({ ok: true, url: session.url, id: session.id });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
