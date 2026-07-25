// F25: generate-period-report groups notes by theme instead of sending every
// note verbatim. Proves (a) a full-season payload stays within budget, and (b)
// NO theme present in the raw notes vanishes from the bucketed payload.
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error("FAIL:", n); } };
const approxTokens = (s) => Math.ceil(s.length / 4);

// bucketByTheme (verbatim from generate-period-report).
const MAX_EXAMPLES = 3;
function bucketByTheme(notes) {
  const map = new Map();
  for (const n of notes) {
    const tags = (n.tags && n.tags.length) ? n.tags : ["(untagged)"];
    for (const t of tags) {
      let b = map.get(t);
      if (!b) { b = { theme: t, count: 0, positive: 0, concern: 0, neutral: 0, examples: [] }; map.set(t, b); }
      b.count++;
      if (n.sentiment === "positive") b.positive++; else if (n.sentiment === "concern") b.concern++; else b.neutral++;
      if (b.examples.length < MAX_EXAMPLES && n.note) b.examples.push(n.note);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// Build a realistic full season: ~40 trainings + ~20 matches, ~15 notes each,
// tags drawn deterministically from 30 themes (so themes recur across the season).
const THEMES = Array.from({ length: 30 }, (_, i) => `theme_${i}`);
const SENT = ["positive", "concern", "neutral"];
const makeNotes = (events, notesPer, seed) => {
  const out = [];
  for (let e = 0; e < events; e++) {
    for (let n = 0; n < notesPer; n++) {
      const k = (e * notesPer + n + seed);
      const tags = [THEMES[k % THEMES.length], THEMES[(k * 7 + 3) % THEMES.length]];
      out.push({
        note: `Note ${k}: the player worked on ${tags[0]} and showed something around ${tags[1]} during this session. `,
        tags, phase: "live", sentiment: SENT[k % 3],
      });
    }
  }
  return out;
};
const training = makeNotes(40, 15, 0); // 600 training notes
const match = makeNotes(20, 15, 100); // 300 match notes

// OLD: every note verbatim (as it was sent before F25).
const oldPayload = JSON.stringify({ training_notes: training, match_notes: match });
// NEW: bucketed by theme.
const newPayload = JSON.stringify({ training_notes: bucketByTheme(training), match_notes: bucketByTheme(match) });

const oldTok = approxTokens(oldPayload), newTok = approxTokens(newPayload);
console.log(`  season notes payload: old=${oldTok} tok, new=${newTok} tok (${Math.round((1 - newTok / oldTok) * 100)}% smaller)`);
ok("F25 bucketed payload much smaller", newTok < oldTok * 0.4);
ok("F25 bucketed payload within budget (<6000 tok)", newTok < 6000);

// No theme vanished: every distinct tag in the raw notes appears as a bucket.
const rawThemes = new Set();
for (const n of [...training, ...match]) for (const t of n.tags) rawThemes.add(t);
const bucketThemes = new Set([...bucketByTheme(training), ...bucketByTheme(match)].map((b) => b.theme));
const missing = [...rawThemes].filter((t) => !bucketThemes.has(t));
ok(`F25 every theme preserved (${rawThemes.size} themes, 0 missing)`, missing.length === 0);

// Counts are correct: sum of training bucket counts == total training tag-occurrences.
const totalTrainingTagOcc = training.reduce((a, n) => a + n.tags.length, 0);
const bucketSum = bucketByTheme(training).reduce((a, b) => a + b.count, 0);
ok("F25 bucket counts sum to total tag-occurrences", bucketSum === totalTrainingTagOcc);

// Examples capped.
ok("F25 examples capped per theme", bucketByTheme(training).every((b) => b.examples.length <= MAX_EXAMPLES));

// Untagged notes are kept, not dropped.
const withUntagged = bucketByTheme([{ note: "no tags here", tags: [], sentiment: "neutral" }]);
ok("F25 untagged notes bucketed, not dropped", withUntagged.some((b) => b.theme === "(untagged)" && b.count === 1));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
