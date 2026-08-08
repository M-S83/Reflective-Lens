// Signing in costs no email.
//
// The app was passwordless: every sign-in sent a magic link. That is pleasant
// with two users and unworkable with ten, because Supabase's built-in sender is
// rate limited per project per hour, and the allowance is spent by people simply
// coming back. A coach signing in on their phone at training and their laptop at
// home cost two emails before writing a word, and when the allowance ran out the
// app looked broken to whoever was next.
//
// The guarantee now: ONE email per person, ever, at sign-up. Everything after
// that is free and instant. That is also what the sign-up screen promises in
// words, so it is worth a check that the code still keeps the promise.
//
// The reset link is the deliberate exception, and it only earns its place
// because it ENDS in a password: a link that signs someone in and leaves them
// with the same broken password would mean another email every visit, which is
// the original problem wearing a different hat.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = (p) => readFileSync(join(here, "../../../web/src", p), "utf8");
const signIn = web("screens/SignIn.tsx");
const app = web("App.tsx");
const provider = web("auth/AuthProvider.tsx");
const client = web("lib/supabase.ts");
const setPw = web("components/SetPassword.tsx");
// The error wording moved into a shared mapper once SetPassword needed it too,
// so the password rules could be answered in one place rather than two.
const authErr = web("lib/authErrors.ts");
const account = web("screens/Account.tsx");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

// Comments explain what was removed and why, so they quote the old approach.
// Reading them as if they were code would let a check pass on an explanation.
const code = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

console.log("signing in costs no email");

// --- sign-in sends nothing ---------------------------------------------------
ok("sign-in uses a password", /signInWithPassword\(/.test(code(signIn)));
ok("no magic link or OTP anywhere in the app",
  !/signInWithOtp\(|verifyOtp\(/.test([signIn, app, provider, account].map(code).join("\n")));
// Not the word: "add the app to your phone" is fine and true. The route.
ok("no phone or SMS route left behind",
  !/phone:|inputMode="tel"|type="tel"|>\s*Mobile\s*</.test(code(signIn)));

// --- exactly one email at sign-up -------------------------------------------
ok("sign-up creates the account with its password", /signUp\(\{[\s\S]{0,200}password/.test(code(signIn)));
// Supabase builds links from one global Site URL, which is whichever address was
// configured last. Without this a tester on the hosted app is sent to a laptop.
ok("the confirmation link returns to wherever the app is running",
  /emailRedirectTo: window\.location\.origin/.test(code(signIn)));

// --- and the copy says so honestly ------------------------------------------
// The screen used to offer a box for a six-digit code that the built-in sender
// never sends, because it locks the templates until custom SMTP is configured.
ok("nothing claims a code is sent", !/\bcode\b/i.test(code(signIn)));
ok("sign-up says it sends one email", /one confirmation email/i.test(signIn));
ok("and says that is the end of it", /not email you again|only email we will send/i.test(signIn));
ok("no em or en dashes", ![signIn, setPw, app].some((s) => /[—–]/.test(s)));

// --- a reset ends in a usable password --------------------------------------
// Without this the link signs them in, drops them on Home with the same password
// that did not work, and the only way back next time is another email.
ok("a reset link is offered when a password is forgotten", /resetPasswordForEmail\(/.test(code(signIn)));
ok("arriving on one is noticed before the hash is consumed",
  /arrivedOnRecoveryLink/.test(code(client)) && /type=recovery/.test(code(client)));
ok("and noticed again from the auth event", /PASSWORD_RECOVERY/.test(code(provider)));
ok("which routes to choosing a password, not to Home",
  /if \(recovery\) return <ChooseNewPassword \/>;/.test(code(app)));
ok("the flag clears only once one is saved", /passwordSet: \(\) => setRecovery\(false\)/.test(code(provider)));
ok("saving actually sets it", /auth\.updateUser\(\{ password \}\)/.test(code(setPw)));

// --- an account from before passwords existed can still get in ---------------
// Everyone who joined before this change has an account and no password. If the
// only route to one were the reset email, every one of them would spend an email
// to fix a problem we created.
ok("a signed-in coach can set a password with no email at all",
  /<SetPasswordForm \/>/.test(code(account)));
ok("and the sign-in error points the rest at the reset link",
  /joined before we had passwords/i.test(authErr));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
