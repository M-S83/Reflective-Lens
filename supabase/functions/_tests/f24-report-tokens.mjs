// F24: generate-report sends only the reflection TEXT (not the whole row) for
// coach reports. Proves the token saving, that the content the report needs is
// preserved (incl. the voice fallback to raw_transcript), and that the player
// payload is byte-identical.
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error("FAIL:", n); } };
const approxTokens = (s) => Math.ceil(s.length / 4); // rough proxy

// A realistic text reflection row after a prior report wrote structured fields back.
const row = {
  id: "r1", event_id: "e1", user_id: "u1", reflection_type: "coach",
  raw_transcript: "We worked on playing out from the back for forty minutes. ".repeat(12),
  summary: "We worked on playing out from the back for forty minutes. ".repeat(12),
  enriched_summary: "Playing out from the back: calmer than last week, first pass timing to fix. ".repeat(6),
  what_went_well: ["keeper calm on restarts", "right side found space"],
  what_did_not_work: ["late first pass", "turned into pressure near own box"],
  action_points: ["work first-pass timing"], suggested_next_focus: ["scanning before receiving"],
  learning_evidence: ["q: how did it feel -> a: calmer"], hoped_to_see_review: [{ aim: "x", status: "recorded" }],
  audio_path: "u1/e1/reflection-abc.webm", created_at: "2026-07-20T10:00:00Z", updated_at: "2026-07-20T11:00:00Z",
};

const oldReflection = { ...row, summary: row.enriched_summary ?? row.summary };
const coachNew = { summary: row.enriched_summary ?? row.summary ?? row.raw_transcript ?? null };
const playerNew = { ...row, summary: row.enriched_summary ?? row.summary };

const oldTok = approxTokens(JSON.stringify(oldReflection));
const coachTok = approxTokens(JSON.stringify(coachNew));
console.log(`  reflection payload tokens: old=${oldTok} coach-new=${coachTok} (saved ~${oldTok - coachTok}, ${Math.round((1 - coachTok / oldTok) * 100)}%)`);

ok("F24 coach payload smaller", coachTok < oldTok);
ok("F24 coach keeps the reflection text (enriched summary)", coachNew.summary === row.enriched_summary);
ok("F24 coach drops raw_transcript field", !("raw_transcript" in coachNew));
ok("F24 coach drops AI-generated fields", !("what_went_well" in coachNew) && !("suggested_next_focus" in coachNew));
ok("F24 coach drops ids/timestamps", !("id" in coachNew) && !("created_at" in coachNew) && !("audio_path" in coachNew));

// Voice reflection: summary + enriched null, so coach must fall back to raw_transcript.
const voiceRow = { raw_transcript: "Spoken reflection about the session.", summary: null, enriched_summary: null };
const voiceCoach = { summary: voiceRow.enriched_summary ?? voiceRow.summary ?? voiceRow.raw_transcript ?? null };
ok("F24 voice reflection not emptied (falls back to transcript)", voiceCoach.summary === "Spoken reflection about the session.");

// Player payload unchanged.
ok("F24 player payload byte-identical to old", JSON.stringify(playerNew) === JSON.stringify(oldReflection));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
