// Runnable check for Tranche 3 idempotency logic (F10, F11, F12). Replicates the
// exact predicates added to the edge functions and asserts branch behaviour.
// (F9 disable + F11 column are verified separately on PG16 by tranche3-db.sh.)
import { webcrypto as crypto } from "node:crypto";
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error("FAIL:", n); } };

// ---- F10: generate-reflection-questions is idempotent ------------------------
const questionsHandler = (existing) => existing.length > 0
  ? { action: "return-existing", inserted: 0 }
  : { action: "generate", inserted: 1 };
ok("F10 existing questions -> return, no insert", questionsHandler([{ id: 1 }]).action === "return-existing");
ok("F10 no questions -> generate", questionsHandler([]).action === "generate");

// ---- F10: review-intent gap questions dedup by text --------------------------
const dedupGaps = (existingTexts, gapRows) => {
  const seen = new Set(existingTexts);
  return gapRows.filter((r) => !seen.has(r.question_text));
};
{
  const gaps = [{ question_text: "Q about press" }, { question_text: "Q about width" }];
  const first = dedupGaps([], gaps);
  const second = dedupGaps(first.map((r) => r.question_text), gaps); // retry
  ok("F10 gap questions insert once", first.length === 2);
  ok("F10 gap questions no dup on retry", second.length === 0);
}

// ---- F11: report change-detection branch -------------------------------------
async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const decide = (prior, fingerprint, isPlayer) => {
  if (!isPlayer && prior && prior.source_fingerprint === fingerprint) return "return-unchanged";
  if (!isPlayer && prior) return "regenerate-in-place";
  return "insert-new";
};
{
  const payloadA = JSON.stringify({ notes: ["a", "b"], reflection: "went ok" });
  const payloadA2 = JSON.stringify({ notes: ["a", "b"], reflection: "went ok" });
  const payloadB = JSON.stringify({ notes: ["a", "b", "c"], reflection: "went ok" });
  const fpA = await sha256(payloadA), fpA2 = await sha256(payloadA2), fpB = await sha256(payloadB);
  ok("F11 identical source -> identical fingerprint", fpA === fpA2);
  ok("F11 changed source -> different fingerprint", fpA !== fpB);
  const prior = { id: "r1", source_fingerprint: fpA };
  ok("F11 unchanged coach report -> return existing (no regen)", decide(prior, fpA, false) === "return-unchanged");
  ok("F11 changed coach report -> regenerate in place (no dup row)", decide(prior, fpB, false) === "regenerate-in-place");
  ok("F11 no prior -> insert", decide(null, fpA, false) === "insert-new");
  ok("F11 player report untouched -> always insert", decide(prior, fpA, true) === "insert-new");
}

// ---- F12: update-voice-profile guard -----------------------------------------
const voiceWrites = (parsed) => parsed.style_summary ? { write: true } : { write: false };
ok("F12 empty/garbage reply -> no write (keeps profile)", voiceWrites({}).write === false);
ok("F12 real profile -> write", voiceWrites({ style_summary: "plain, warm" }).write === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
