// F7: "phase" means phase_of_play (the tactical phase) everywhere it is surfaced;
// capture_phase (when a note was taken) is not surfaced as "phase". Asserts the
// three sites are aligned.
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error("FAIL:", n); } };
const read = (p) => readFileSync(`supabase/functions/${p}`, "utf8");

const report = read("generate-report/index.ts");
const period = read("generate-period-report/index.ts");
const review = read("review-intent/index.ts");

// per-session report already uses phase_of_play
ok("F7 generate-report surfaces phase_of_play", report.includes("phase: o.phase_of_play"));
ok("F7 generate-report does not surface capture_phase as phase", !report.includes("o.capture_phase"));

// review-intent now uses phase_of_play (was capture_phase)
ok("F7 review-intent selects phase_of_play", review.includes("phase_of_play, cleaned_note"));
ok("F7 review-intent surfaces phase_of_play", review.includes("phase: o.phase_of_play"));
ok("F7 review-intent no longer uses capture_phase", !review.includes("capture_phase"));

// period-report no longer reads the (now unused) capture_phase
ok("F7 period-report drops dead capture_phase read", !period.includes("capture_phase"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
