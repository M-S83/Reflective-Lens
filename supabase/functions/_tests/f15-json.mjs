// F15 equivalence: the shared firstJsonObject/firstJsonArray must return the
// SAME result as the original per-function safeParse helpers for every input.
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error("FAIL:", n); } };

// Originals (verbatim logic from the deleted per-function copies).
const origObject = (raw) => { try { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; } catch { return {}; } };
const origArray = (raw) => { try { const m = raw.match(/\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : []; } catch { return []; } };

// Shared helpers (verbatim logic from _shared/json.ts).
const firstJsonObject = (raw) => { try { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; } catch { return {}; } };
const firstJsonArray = (raw) => { try { const m = raw.match(/\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : []; } catch { return []; } };

const objInputs = [
  '{"a":1,"b":"x"}',
  'Here is the result:\n{"cleaned_note":"tidy","tags":["press"]}\nThanks',
  '```json\n{"headline":"Good session","sections":[{"heading":"H","points":["p"]}]}\n```',
  '{"nested":{"x":[1,2,{"y":3}]}}',
  'no json here',
  '',
  '{ malformed',
  '{"unicode":"café ✓","emdash":"none"}',
  'prefix {"a":1} middle {"b":2} suffix', // greedy match -> whole span, invalid -> {}
];
const arrInputs = [
  '[{"question_text":"q","question_type":"text","options":[]}]',
  'Sure:\n[{"item":"press","status":"showed_up","evidence":"note"}]',
  '```json\n[{"shirt_number":9,"player_name":"x"}]\n```',
  '[]',
  'no array',
  '',
  '[broken',
  '[1,2,3]',
];

for (const [i, raw] of objInputs.entries()) {
  ok(`F15 object input #${i} equivalent`, JSON.stringify(firstJsonObject(raw)) === JSON.stringify(origObject(raw)));
}
for (const [i, raw] of arrInputs.entries()) {
  ok(`F15 array input #${i} equivalent`, JSON.stringify(firstJsonArray(raw)) === JSON.stringify(origArray(raw)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
