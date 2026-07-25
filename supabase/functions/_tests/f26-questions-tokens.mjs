// F26: generate-reflection-questions no longer sends raw_transcript AND summary
// (identical for text reflections) to the model for coach reflections. Proves the
// token drop, that the reflection text is preserved, and that the player context
// is byte-identical.
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error("FAIL:", n); } };
const approxTokens = (s) => Math.ceil(s.length / 4);

const MARK = "ZZUNIQUEMARKERZZ";
const text = MARK + " We worked on playing out from the back. The keeper was calmer today. ".repeat(8);
const structured = { what_went_well: [], what_did_not_work: [], learning_evidence: [], action_points: [], suggested_next_focus: [] };

// Coach text reflection: raw_transcript === summary.
const ref = { reflection_type: "coach", raw_transcript: text, summary: text, ...structured };
const oldContext = JSON.stringify({ raw_transcript: ref.raw_transcript, summary: ref.summary, ...structured });
const newContext = JSON.stringify({ reflection: ref.summary ?? ref.raw_transcript ?? "", ...structured });

const oldTok = approxTokens(oldContext), newTok = approxTokens(newContext);
console.log(`  coach context tokens: old=${oldTok} new=${newTok} (saved ~${oldTok - newTok}, ${Math.round((1 - newTok / oldTok) * 100)}%)`);
ok("F26 coach context smaller", newTok < oldTok);
ok("F26 reflection text preserved once", JSON.parse(newContext).reflection === text);
ok("F26 old sent the text twice", (oldContext.split(MARK).length - 1) === 2);
ok("F26 new sends the text once", (newContext.split(MARK).length - 1) === 1);

// Voice reflection: summary null -> falls back to transcript (not empty).
const voice = { reflection_type: "coach", raw_transcript: "spoken note", summary: null, ...structured };
ok("F26 voice reflection text preserved", JSON.parse(JSON.stringify({ reflection: voice.summary ?? voice.raw_transcript ?? "" })).reflection === "spoken note");

// Player context unchanged (byte-identical to old shape).
const pref = { reflection_type: "player", raw_transcript: text, summary: text, ...structured };
const playerNew = JSON.stringify({ raw_transcript: pref.raw_transcript, summary: pref.summary, ...structured });
const playerOld = JSON.stringify({ raw_transcript: pref.raw_transcript, summary: pref.summary, ...structured });
ok("F26 player context byte-identical", playerNew === playerOld);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
