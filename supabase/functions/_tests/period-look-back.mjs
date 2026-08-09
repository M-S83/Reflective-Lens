// A period report ends by asking, not by telling.
//
// A single session has closed with an open question about running it again
// since the day that was built. A month or a season closed with "Focus ahead",
// and the model wrote it. So the longer the period, the more the app decided on
// the coach's behalf, which is exactly the wrong way round: a season is where a
// coach most needs to reach their own conclusion, not least.
//
// Two changes, and they belong together. "focus_ahead" becomes "noted_for_next",
// restating only what the coach themselves said they would do, the same shape
// the single-session report already uses. And the reflecting is done by a fixed
// question in code, which cannot drift into a suggestion, costs nothing, and
// reads the same after every period.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, "../generate-period-report/index.ts");
const src = readFileSync(srcPath, "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

// Comments quote the old behaviour to explain the change, so reading them as
// code would let a check pass on the explanation rather than the fix.
const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

// Pull the one exported helper out and run it. The wording is the whole point,
// so asserting it exists is not the same as asserting what it says.
const fn = (src.match(/export function lookBack[\s\S]*?\n\}/) ?? [""])[0];
const dir = mkdtempSync(join(tmpdir(), "rl-lookback-"));
const mod = join(dir, "lookBack.mjs");
writeFileSync(mod, fn.replace(/: string/g, "").replace("export ", "export "));
const { lookBack } = await import(mod);

console.log("the period report closes with a question");

// --- the question itself -----------------------------------------------------
const month = lookBack("monthly");
ok(`there is one (${JSON.stringify(month)})`, !!month);
ok("it is a question", month.trim().endsWith("?"));
// Without "if anything" the question presumes the month went badly, which is a
// verdict with a question mark on it.
ok("it presumes nothing went wrong", /if anything/i.test(month));
ok("it names no part of their coaching", !/press|player|shape|drill|pitch|formation/i.test(month));
ok("it suggests nothing", !/\b(try|should|could|consider|recommend|maybe|improve)\b/i.test(month));
ok("no em or en dashes", !/[—–]/.test(month));

// --- it says which period, in words a coach would use ------------------------
ok("weekly says the week", /this week/.test(lookBack("weekly")));
ok("monthly says the month", /this month/.test(lookBack("monthly")));
ok("season says the season", /the season/.test(lookBack("season")));
// A report type nobody has added yet should still read as English.
ok("an unknown period still reads properly", /this period/.test(lookBack("something_new")));

// --- fixed in code, and always there -----------------------------------------
ok("it is written in code, not asked of the model",
  /blocks\.push\(\{ t: "bullets", heading: "Looking back", items: \[lookBack\(reportType\)\] \}\)/.test(code));
ok("and comes last", code.indexOf('heading: "Looking back"') > code.indexOf('bl("Training'));
ok("the report knows which period it is", /toMarkdown\(heading, record, content_json, report_type\)/.test(code));

// --- the model no longer decides what comes next -----------------------------
ok("focus_ahead is gone from what the model returns", !/"focus_ahead" \(string\[\]\)/.test(code));
ok("replaced by the coach's own stated intention", /"noted_for_next" \(string\[\]\)/.test(code));
ok("and the prompt says to restate, not to form one",
  /Quote their intention, do not form one/.test(code));
// An empty section is better than an invented one, and saying so out loud in
// the prompt is what stops the model filling it.
ok("an empty answer is allowed", /return an empty array: that is a normal outcome/.test(code));
ok("the heading no longer reads as advice", !/bl\("Focus ahead"/.test(code));
ok("it reads as theirs", /bl\("What you said you would look at"/.test(code));
// Reports written before this change still have the old key.
ok("old reports still render", /c\.noted_for_next \?\? c\.focus_ahead/.test(code));

// --- and the shared principle is still there ---------------------------------
ok("MIRROR_NOT_VERDICT still in the prompt", /MIRROR_NOT_VERDICT/.test(code));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
