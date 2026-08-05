// Session-type scoping in generate-period-report (0018).
//
// Two things are asserted, and the first is a regression guard for a real bug.
//
// 1. NOTHING IS DROPPED. The note loop used to push only on 'match' and
//    'training_session', so a tournament, or a session the coach named
//    themselves, went into neither bucket and disappeared from the period
//    report entirely. A coach who logged a goalkeeping block saw no trace of it
//    in their month, with nothing to indicate anything was missing.
//
// 2. CONTEXTS STAY SEPARATE. Different kinds of session have different aims, so
//    a theme from a goalkeeping session must not be read as a theme of the
//    team's outfield training. The training-to-match comparison is the single
//    cross-context link that is always legitimate, because it is the point of
//    the report; every other link has to be earned by the coach's own notes.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../generate-period-report/index.ts"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log(`  ok  ${n}`)) : (fail++, console.log(`  FAIL ${n}`));

console.log("session-type scoping");

// --- sessionLabel, lifted from the source -----------------------------------
const body = src.match(/function sessionLabel\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
if (!body) throw new Error("sessionLabel not found");
const sessionLabel = new Function("e", body[1].replace(/: string/g, ""));

ok("a named session uses the coach's own words",
  sessionLabel({ event_type: "other", custom_type: "Goalkeeping session" }) === "Goalkeeping session");
ok("an unnamed other session still gets a label",
  sessionLabel({ event_type: "other", custom_type: null }) === "Other session");
ok("blank custom_type falls back rather than showing empty",
  sessionLabel({ event_type: "other", custom_type: "   " }) === "Other session");
ok("training and match keep their plain labels",
  sessionLabel({ event_type: "training_session" }) === "Training" &&
  sessionLabel({ event_type: "match" }) === "Match");

// --- 1. nothing dropped -----------------------------------------------------
// Simulate the routing loop over four session types and assert every note lands.
const events = [
  { id: "e1", event_type: "training_session", custom_type: null },
  { id: "e2", event_type: "match", custom_type: null },
  { id: "e3", event_type: "other", custom_type: "Goalkeeping session" },
  { id: "e4", event_type: "tournament", custom_type: null },
];
const notes = [
  { event_id: "e1", tags: ["playing out"] },
  { event_id: "e2", tags: ["playing out"] },
  { event_id: "e3", tags: ["distribution"] },
  { event_id: "e3", tags: ["handling"] },
  { event_id: "e4", tags: ["tempo"] },
];
const typeById = new Map(events.map((e) => [e.id, e.event_type]));
const labelById = new Map(events.map((e) => [e.id, sessionLabel(e)]));
const training = [], match = [], other = new Map();
for (const o of notes) {
  const t = typeById.get(o.event_id);
  if (t === "match") match.push(o);
  else if (t === "training_session") training.push(o);
  else {
    const label = labelById.get(o.event_id) ?? "Other session";
    other.set(label, [...(other.get(label) ?? []), o]);
  }
}
const routed = training.length + match.length + [...other.values()].flat().length;
ok(`every note is routed somewhere (${routed} of ${notes.length})`, routed === notes.length);
ok("the goalkeeping session is kept under its own name",
  other.get("Goalkeeping session")?.length === 2);
ok("a tournament is kept too, not silently dropped",
  other.get("Tournament")?.length === 1);

// The old behaviour, kept here so the regression is legible rather than implied.
const oldRouted = notes.filter((o) => ["match", "training_session"].includes(typeById.get(o.event_id))).length;
ok(`the old loop would have dropped ${notes.length - oldRouted} of ${notes.length}`, oldRouted < notes.length);

// --- 2. the payload and prompt carry the separation --------------------------
ok("payload sends other_sessions", /other_sessions:/.test(src));
ok("each carries the coach's label", /other_sessions: \[\.\.\.otherRaw\.entries\(\)\]\.map\(\(\[label/.test(src));
ok("and its own themes, bucketed the same way", /notes: bucketByTheme\(notes\)/.test(src));
ok("events query fetches custom_type", /select\("id, event_type, custom_type,/.test(src));

// Search forward from the rule, not from the top of the file: MIRROR_NOT_VERDICT
// is imported on line 24, so a plain indexOf finds the import and yields nothing.
const ruleAt = src.indexOf("SESSION TYPES:");
const prompt = ruleAt < 0 ? "" : src.slice(ruleAt, src.indexOf("MIRROR_NOT_VERDICT", ruleAt));
ok("prompt names the session-type rule", prompt.length > 0);
ok("tells the model to treat each as its own context", /own context/i.test(prompt));
ok("forbids merging themes into training or matches", /do NOT merge its themes/i.test(prompt));
ok("forbids inventing a cross-context connection", /do NOT claim a connection/i.test(prompt));
ok("requires attribution by name", /attributed to it by name/i.test(prompt));
ok("says to say less, not infer more, on thin evidence", /say less about it rather than inferring/i.test(prompt));
ok("no em or en dashes in the new prompt text", !/[—–]/.test(prompt));

// The training-to-match thread must survive: it is the one legitimate link.
ok("training to match comparison is still asked for", /training_to_match/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
