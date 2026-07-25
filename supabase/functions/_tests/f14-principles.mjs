// F14: the "MIRROR, NOT VERDICT" principle is one canonical constant. Coach
// callers are repointed to it, keeping their task-specific clauses; player/mixed
// callers are left for the player pass. This asserts the repoint happened, no
// task instruction was dropped, and player paths were not touched.
// NOTE: this proves the PROMPT still carries the instructions; it does NOT prove
// model output quality - that needs the end-to-end staging run (see reply).
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error("FAIL:", n); } };
const read = (p) => readFileSync(`supabase/functions/${p}`, "utf8");

// Canonical content.
const principles = read("_shared/principles.ts");
ok("canonical keeps MIRROR, NOT VERDICT", principles.includes("MIRROR, NOT VERDICT"));
ok("canonical has full never-list incl. teach", /never grade, judge, praise, criticise, teach/i.test(principles));
ok("canonical says reflect back only what they said", /reflect back only what the/i.test(principles));

// Repointed coach callers: reference the constant AND keep their task clause.
const taskPhrase = {
  "clean-observation/index.ts": "into textbook language",
  "enrich-reflection/index.ts": "the enriched",
  "review-intent/index.ts": "touched on each aim",
  "generate-period-report/index.ts": "training_to_match",
  "generate-reflection-questions/index.ts": "invite a bit more detail",
};
for (const [file, phrase] of Object.entries(taskPhrase)) {
  const src = read(file);
  ok(`F14 ${file} imports principles`, src.includes('from "../_shared/principles.ts"'));
  ok(`F14 ${file} references MIRROR_NOT_VERDICT`, src.includes("MIRROR_NOT_VERDICT +"));
  ok(`F14 ${file} keeps its task clause`, src.includes(phrase));
}

// Player / mixed callers left untouched: no principles import, still inline it.
for (const f of ["generate-player-summary/index.ts", "generate-report/index.ts"]) {
  const src = read(f);
  ok(`F14 ${f} NOT repointed (player/mixed, left)`, !src.includes('from "../_shared/principles.ts"'));
  ok(`F14 ${f} still has inline principle`, src.includes("MIRROR, NOT VERDICT"));
}
// player question branch unchanged
const gq = read("generate-reflection-questions/index.ts");
ok("F14 playerSystem left unchanged", gq.includes("never judge or tell them what to do"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
