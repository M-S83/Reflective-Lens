// Supabase's auth errors are accurate and unhelpful. These are the ones a coach
// will actually meet, in words they can act on.
//
// The password rules live in the Supabase dashboard, not in this code, so they
// can be changed without a deploy and this file cannot know what they are. That
// is exactly why the rejection has to be translated rather than assumed: the app
// checks length, the server checks whatever it has been told to, and the gap
// between the two is where a tester gets stuck with "Password should contain at
// least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFG...".
// "a, b and c" rather than "a, b, c", because this is read as a sentence.
const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();

  // --- signing in -----------------------------------------------------------
  if (m.includes("invalid login credentials")) {
    // Also what an account from before passwords existed hits, and there is no
    // way to tell the two apart from here, so the message has to serve both.
    return "That email and password do not match an account. If you joined before we had passwords, use the forgotten password link below to set one.";
  }
  if (m.includes("email not confirmed")) {
    return "Almost there. Tap the confirmation link in your email first, then sign in.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "There is already an account with that email. Sign in instead, or use the forgotten password link.";
  }

  // --- choosing a password --------------------------------------------------
  // Supabase spells the requirement as three alphabets, which is true and
  // unreadable on a phone.
  if (m.includes("contain at least one character of each")) {
    // Read the ORIGINAL message, not the lowercased copy: the whole point is to
    // tell the two alphabets apart, and lowercasing destroys that.
    const needs: string[] = [];
    if (message.includes("abcdefghijklmnopqrstuvwxyz")) needs.push("a lower case letter");
    if (message.includes("ABCDEFGHIJKLMNOPQRSTUVWXYZ")) needs.push("a capital letter");
    if (message.includes("0123456789")) needs.push("a number");
    return needs.length
      ? `That password needs ${list(needs)}. Everything else is up to you.`
      : "That password does not meet the rules for this app. Try adding a capital letter and a number.";
  }
  if (m.includes("password should be at least")) {
    const n = (message.match(/at least (\d+)/) ?? [])[1];
    return n ? `That password is too short. It needs at least ${n} characters.` : "That password is too short.";
  }
  if (m.includes("known to be weak") || m.includes("pwned") || m.includes("easy to guess")) {
    return "That password has turned up in a known data breach, so it is not safe to use. Please pick a different one.";
  }
  if (m.includes("same as the old password") || m.includes("should be different from the old")) {
    return "That is the password you already have. Choose a different one.";
  }

  // --- rate limits ----------------------------------------------------------
  // Worth naming, because the fix is to wait rather than to keep trying.
  if (m.includes("rate limit") || m.includes("too many requests") || m.includes("for security purposes")) {
    return "Too many attempts just now. Wait a minute and try again.";
  }

  return message;
}
