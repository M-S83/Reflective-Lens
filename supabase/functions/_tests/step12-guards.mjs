// Runnable check for the coach-hardening guards. Replicates the EXACT predicates
// added to the edge functions and asserts branch behaviour. Not a DB test; it
// verifies the decision logic (blank-guard, no-overwrite guards).
//
// Note: F1 field-level name-stripping was reverted. Coach reports use player
// names as recorded in the notes (in training there are no shirt numbers, and
// the free-text notes carry names regardless). PII is handled by the processor/
// consent/retention posture (audit Q6), not by stripping structured fields.
// The one PII change that stands is F2: the model reply body is never logged.
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error("FAIL:", name); } };

// ---- F2: generate-report failure log carries no reply body -------------------
// The log payload is { event_id, length } only — no `head`/body slice.
const logPayload = (event_id, raw) => ({ event_id, length: (raw ?? "").length });
const lp = logPayload("evt-1", "Oscar scored twice; great scanning from number 7");
ok("F2 log has no reply body", !("head" in lp) && !JSON.stringify(lp).includes("Oscar"));
ok("F2 log keeps length + id", lp.length > 0 && lp.event_id === "evt-1");

// ---- F19: generate-period-report blank guard --------------------------------
const structuredOf = (c) => !!((Array.isArray(c.sections) && c.sections.length) || c.headline || c.results_summary || (Array.isArray(c.recurring_themes) && c.recurring_themes.length));
const markdownFor = (heading, raw, c) => structuredOf(c)
  ? `# ${heading}\n\n[structured]`
  : `# ${heading}\n\n${(raw ?? "").trim() || "_The report came back empty. Please try generating it again._"}`;
ok("F19 structured -> structured md", structuredOf({ headline: "x", sections: [] }) === true);
ok("F19 empty json + raw text -> raw fallback (not blank)", markdownFor("H", "some prose", {}).includes("some prose"));
ok("F19 empty json + empty raw -> retry message (never blank body)", markdownFor("H", "", {}).includes("came back empty"));
ok("F19 garbage never yields heading-only report", markdownFor("H", "", {}) !== "# H\n\n");

// ---- F20: enrich-reflection empty guard --------------------------------------
const enrichWrites = (raw) => { const s = (raw ?? "").trim(); return s ? { write: true } : { write: false }; };
ok("F20 empty reply -> no write (keeps previous)", enrichWrites("   ").write === false);
ok("F20 real reply -> write", enrichWrites("A tidy enriched summary.").write === true);

// ---- F21: review-intent empty guard ------------------------------------------
const reviewWrites = (review) => review.length === 0 ? { write: false } : { write: true };
ok("F21 empty review (parse fail) -> no write (keeps previous)", reviewWrites([]).write === false);
ok("F21 real review -> write", reviewWrites([{ item: "press", status: "showed_up", evidence: "note" }]).write === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
