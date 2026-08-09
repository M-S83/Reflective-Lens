// A function that fails has to say so somewhere a human will look.
//
// This exists because of an evening spent hunting a voice note that never came
// back. The trail went cold in the most frustrating way available:
//
//   the dashboard said 0 invocations and no errors
//   the logs showed the function BOOTING, four times, and nothing after
//   the app showed "Transcribing…", for ever, with no error anywhere
//
// Three things were true at once, and each one hid the next.
//
//   1. Every function caught its error and returned it in the RESPONSE BODY.
//      That only helps if the caller reads the body.
//   2. The caller did not. supabase.functions.invoke resolves with
//      { data, error } rather than throwing, so `await invoke(...)` on a line
//      of its own succeeds no matter what came back.
//   3. So nothing was written to the log, and a failing function looked
//      identical to one that worked.
//
// The fix is one line per function and it is the difference between reading the
// answer and guessing at it. When a tester hits this, there is no console to
// look over their shoulder at: the log is all there is.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fnDir = join(here, "..");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

const functions = readdirSync(fnDir)
  .filter((d) => !d.startsWith("_") && !d.startsWith("."))
  .filter((d) => {
    try { return statSync(join(fnDir, d, "index.ts")).isFile(); } catch { return false; }
  });

console.log("a failure has to be visible");

ok("there are functions to check", functions.length >= 15);

// --- every function that can fail, says so -----------------------------------
const silent = functions.filter((f) => {
  const src = readFileSync(join(fnDir, f, "index.ts"), "utf8");
  return /\}\s*catch/.test(src) && !/console\.error/.test(src);
});
ok(`no function swallows its own error (${functions.length} checked)`, silent.length === 0);
if (silent.length) console.log("      silent:", silent.join(", "));

// --- and the one that started it --------------------------------------------
// Named directly rather than left to the sweep above, because this is the one
// that cost an evening and the one a tester is most likely to hit.
const stt = readFileSync(join(fnDir, "transcribe-audio/index.ts"), "utf8");
ok("transcribe-audio logs its failures", /console\.error\(/.test(stt));
// The provider's own status and message, verbatim. "Transcription failed" tells
// you nothing; "401 invalid_api_key" or "429 insufficient_quota" is the answer.
ok("and the provider's status reaches that log",
  /STT error \$\{res\.status\}/.test(stt));

// --- the caller looks at the answer ------------------------------------------
// The other half. Logging is no use if the app carries on regardless and leaves
// a coach watching a word that will never change.
const db = readFileSync(join(here, "../../../web/src/lib/db.ts"), "utf8");
const dbCode = db.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
ok("the app has one place that checks an invoke", /async function callFunction/.test(dbCode));
ok("and it throws when the call did not land", /if \(error\) throw new Error/.test(dbCode));
// Four paths reach the transcriber: a voice note, a reflection, a spoken answer,
// and asking again for one that never came back. All of them are things a coach
// cannot retype from memory, which is why none may fail quietly.
ok("every transcription path goes through it",
  (dbCode.match(/callFunction\("transcribe-audio"/g) ?? []).length === 4);
// Said in the right order: what is safe, then what failed. A coach who thinks
// they have lost the recording will not try again.
ok("and the message says the recording is safe first",
  /recording is saved, but transcribing it could not start/.test(db));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
