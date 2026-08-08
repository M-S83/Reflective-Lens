// A rejected password has to say what to do about it.
//
// The password rules live in the Supabase dashboard, not in this repo, so the
// app cannot know what they are. Right now the project requires a lower case
// letter, a capital and a digit, and the sign-up screen only checks length. So a
// coach types "footballtraining", the app is happy, and the server answers:
//
//   Password should contain at least one character of each:
//   abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.
//
// That is three alphabets on a phone screen at a cold training ground. Whatever
// the dashboard is set to, the rejection has to arrive in words.
//
// This test IMPORTS AND RUNS the mapper rather than grepping the source, which
// is worth the small amount of type-stripping: a regex over source can tell you
// a branch exists, not that it produces a sentence a human can act on.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, "../../../web/src/lib/authErrors.ts");
const ts = readFileSync(srcPath, "utf8");

// The file is deliberately dependency-free so this is a type strip, not a build.
const js = ts.replace(/: string\[\]/g, "").replace(/: string/g, "");
const dir = mkdtempSync(join(tmpdir(), "rl-autherr-"));
const modPath = join(dir, "authErrors.mjs");
writeFileSync(modPath, js);
const { friendlyAuthError: f } = await import(modPath);

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

console.log("a rejected password says what to do");

// --- the composition rule, spelled as alphabets ------------------------------
const all = f(
  "Password should contain at least one character of each: " +
  "abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.",
);
ok(`names all three (${JSON.stringify(all)})`,
  /lower case letter/.test(all) && /capital letter/.test(all) && /number/.test(all));
ok("and shows no alphabets", !/abcdefghij/i.test(all));
ok("reads as a sentence, not a list", / and a number/.test(all));

// Lowercasing the message to test it would destroy the only thing that
// distinguishes the two alphabets, so the mapper must read the original.
const upperOnly = f("Password should contain at least one character of each: ABCDEFGHIJKLMNOPQRSTUVWXYZ.");
ok("tells a capital from a lower case", /capital/.test(upperOnly) && !/lower case/.test(upperOnly));
const digitsOnly = f("Password should contain at least one character of each: 0123456789.");
ok("asks only for what is missing", /number/.test(digitsOnly) && !/capital|lower case/.test(digitsOnly));

// --- length, which the app also checks but the server decides ----------------
const short = f("Password should be at least 8 characters.");
ok(`repeats the server's number (${JSON.stringify(short)})`, /at least 8 characters/.test(short));
ok("so raising it in the dashboard needs no deploy", /\$\{n\}/.test(ts));

// --- the rest of what a coach meets -----------------------------------------
ok("a wrong password points at the reset link",
  /forgotten password/i.test(f("Invalid login credentials")));
ok("an unconfirmed account says to tap the link",
  /confirmation link/i.test(f("Email not confirmed")));
ok("an existing account says to sign in instead",
  /sign in instead/i.test(f("User already registered")));
ok("a breached password explains why, not just that",
  /data breach/i.test(f("Password is known to be weak and easy to guess, please choose a different one.")));
// The fix is to wait, so saying so stops someone hammering the button.
ok("a rate limit says to wait",
  /wait a minute/i.test(f("For security purposes, you can only request this after 51 seconds.")));

// --- anything unrecognised is passed through, not swallowed ------------------
// A message nobody has seen before is more use raw than replaced by a guess.
ok("an unknown error survives intact", f("Some new thing went wrong") === "Some new thing went wrong");

// --- house style -------------------------------------------------------------
const outputs = [all, upperOnly, digitsOnly, short,
  f("Invalid login credentials"), f("Email not confirmed"), f("User already registered")];
ok("no em or en dashes in any of it", !outputs.some((s) => /[—–]/.test(s)));
ok("British spelling", !outputs.some((s) => /\bauthorize|\bcapitalize/i.test(s)));

// --- and both password screens use it ---------------------------------------
const signIn = readFileSync(join(here, "../../../web/src/screens/SignIn.tsx"), "utf8");
const setPw = readFileSync(join(here, "../../../web/src/components/SetPassword.tsx"), "utf8");
ok("sign in and sign up map their errors", /friendlyAuthError\(/.test(signIn));
ok("and so does choosing a new password", /friendlyAuthError\(/.test(setPw));
ok("there is only one copy of the mapping", !/function friendly\(/.test(signIn));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
