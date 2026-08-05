// =============================================================================
// _shared/email.ts — transactional email, via Resend.
//
// Deliberately tiny. The app sends a handful of plain, factual messages (your
// free month is nearly up), never marketing, so there is no template engine and
// no list management here.
//
// Configuration is optional on purpose. Without RESEND_API_KEY the app runs
// exactly as before and nothing that sends email is reachable, which is what
// lets a project deploy and be tested before anyone has picked an email
// provider. Callers ask emailConfigured() first and skip cleanly.
// =============================================================================

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailConfigured(): boolean {
  return Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("EMAIL_FROM"));
}

export interface Email {
  to: string;
  subject: string;
  html: string;
}

// Throws on any non-2xx so the caller can roll back its idempotency row and let
// the next sweep retry. Silence here would mean a coach is marked as emailed
// without ever having been emailed, which is worse than a retry.
export async function sendEmail(email: Email): Promise<void> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!key || !from) throw new Error("email not configured");

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
    }),
  });

  if (!res.ok) {
    // The body can echo the recipient address, so keep it out of the message.
    throw new Error(`email send failed: ${res.status}`);
  }
}

// -----------------------------------------------------------------------------
// The house wrapper. British English, no em or en dashes, no exclamation marks,
// and no encouragement to "keep up the great work": the app mirrors, it does not
// cheerlead. Plain system furniture only.
// -----------------------------------------------------------------------------
function shell(body: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1f2933;max-width:520px">
${body}
<hr style="border:none;border-top:1px solid #e4e7eb;margin:28px 0" />
<p style="font-size:12px;color:#7b8794;margin:0">Reflective Lens. See your coaching clearly.</p>
</div>`;
}

// A coach's free month is nearly up. States the fact and what happens next, and
// makes no claim about how well they have been using it.
export function trialReminderEmail(opts: {
  name: string | null;
  daysLeft: number;
  appUrl: string;
}): { subject: string; html: string } {
  const greeting = opts.name ? `Hello ${opts.name},` : "Hello,";
  const when = opts.daysLeft === 1 ? "tomorrow" : `in ${opts.daysLeft} days`;
  const subject = opts.daysLeft === 1
    ? "Your free month of Reflective Lens ends tomorrow"
    : `Your free month of Reflective Lens ends in ${opts.daysLeft} days`;

  return {
    subject,
    html: shell(
      `<p>${greeting}</p>
<p>Your free month of Reflective Lens ends ${when}.</p>
<p>Your reflections and reports stay yours either way. If you would like to carry
on, you can choose a plan from your account. If you would rather not, you do not
need to do anything, and you can still export what you have written.</p>
<p><a href="${opts.appUrl}/account" style="color:#2f855a">Open your account</a></p>`,
    ),
  };
}
