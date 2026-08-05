// Feedback and beta analytics (0019), checked without a database.
//
// The thing most worth guarding here is the view gating. analytics_* are plain
// views, and a view has NO row level security of its own: it runs with its
// owner's rights, so one that forgets its is_admin() filter hands every user's
// rows to anyone who can select it. The four views added in 0019 all read from
// tables that hold other people's data, so each one has to carry that filter
// itself. This asserts every analytics view in the repo does, not just the new
// ones, because the next one added is the one that will forget.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, "../../migrations");
const sql = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()
  .map((f) => readFileSync(join(migDir, f), "utf8")).join("\n");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

console.log("feedback + beta analytics");

// --- every analytics view gates on is_admin() -------------------------------
const viewRe = /create (?:or replace )?view public\.(analytics_\w+) as([\s\S]*?);\s*(?=\n(?:--|create|grant|alter|comment|$))/gi;
const views = [...sql.matchAll(viewRe)];
ok(`found the analytics views (${views.length})`, views.length >= 10);
for (const [, name, body] of views) {
  ok(`${name} filters on is_admin()`, /is_admin\(\)/.test(body));
}

// --- feedback table ---------------------------------------------------------
const fb = sql.slice(sql.indexOf("create table public.feedback"));
ok("feedback has RLS enabled", /alter table public\.feedback enable row level security/.test(sql));
ok("a tester may only insert as themselves", /"feedback: insert own"[\s\S]{0,90}user_id = auth\.uid\(\)/.test(sql));
ok("reads are own-or-admin", /"feedback: read own or admin"[\s\S]{0,120}user_id = auth\.uid\(\) or public\.is_admin\(\)/.test(sql));
ok("only an admin may update", /"feedback: admin triages"[\s\S]{0,120}public\.is_admin\(\)/.test(sql));

// Nothing may be deleted by anyone: feedback is a record. Assert no delete
// policy exists for it, so a tester cannot retract a bug report and the owner
// cannot quietly bin one.
const fbPolicies = [...sql.matchAll(/create policy "feedback: [^"]+" on public\.feedback for (\w+)/g)].map((m) => m[1]);
ok(`no delete policy on feedback (has: ${fbPolicies.join(", ")})`, !fbPolicies.includes("delete"));

// --- the client ------------------------------------------------------------
const lib = readFileSync(join(here, "../../../web/src/lib/feedback.ts"), "utf8");
const form = readFileSync(join(here, "../../../web/src/components/Feedback.tsx"), "utf8");

ok("submission stamps the screen it came from", /path: window\.location\.pathname/.test(lib));

// What gets attached matters: a feedback row travels to the owner, so it must
// carry enough to reproduce the problem and nothing the coach was writing. Read
// the context object's keys rather than grepping for suspicious words, which
// false-positives on things like owner_note.
const ctxBody = lib.match(/context: \{([\s\S]*?)\n {4}\},/);
const ctxKeys = ctxBody ? [...ctxBody[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).sort() : [];
ok(`context carries only path, viewport, user agent (got: ${ctxKeys.join(", ") || "none"})`,
  ctxKeys.join(",") === "path,user_agent,viewport");
ok("the form says what it captures", /which screen you were on/i.test(form));
ok("kinds cover broken, confusing, idea and good", /issue[\s\S]*confusing[\s\S]*suggestion[\s\S]*praise/.test(lib));

// House style: this is all user-facing copy.
for (const [label, text] of [["lib", lib], ["form", form]]) {
  const strings = [...text.matchAll(/"([^"\\]{12,})"/g)].map((m) => m[1]).join(" ");
  ok(`no em or en dashes in ${label} copy`, !/[—–]/.test(strings));
}
ok("no exclamation marks in the thank you", !/Thank you[^<]*!/.test(form));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
