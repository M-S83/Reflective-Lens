// Runnable check for F4 (coach reflection engine) logic. Replicates the exact
// predicates/mappings added to generate-report and asserts branch behaviour.
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error("FAIL:", n); } };

// ---- F4: step-6 partial-input guard (coach needs a reflection) ---------------
const coachReportAllowed = (isPlayer, r) =>
  isPlayer ? true : !!(r && (((r.summary ?? "")).trim() || ((r.raw_transcript ?? "")).trim()));
ok("F4 coach report blocked with no reflection", coachReportAllowed(false, null) === false);
ok("F4 coach report blocked with empty reflection", coachReportAllowed(false, { summary: "", raw_transcript: "" }) === false);
ok("F4 coach report allowed with reflection text", coachReportAllowed(false, { summary: "we worked on shape" }) === true);
ok("F4 player path not blocked by this guard", coachReportAllowed(true, null) === true);

// ---- F4 x F11: write-back must NOT change the source fingerprint --------------
const sourceHash = (event, observations, reflection, qa, match) => JSON.stringify({
  aims: event.hoping_to_see ?? [], focus: event.focus_area ?? null, purpose: event.purpose ?? null,
  notes: observations.map((o) => o.cleaned_note ?? o.raw_note),
  reflection: reflection.raw_transcript ?? reflection.summary ?? null,
  answers: qa, result: match ?? null,
});
{
  const ev = { hoping_to_see: ["press"], focus_area: "pressing", purpose: "..." };
  const obs = [{ cleaned_note: "pressed well" }]; const qa = [{ question: "q", answer: "a" }];
  const before = { raw_transcript: "my reflection", summary: "my reflection", what_went_well: [], suggested_next_focus: [] };
  const after = { raw_transcript: "my reflection", summary: "my reflection", what_went_well: ["pressed high"], suggested_next_focus: ["hold press longer"] };
  ok("F4xF11 write-back does NOT change the fingerprint", sourceHash(ev, obs, before, qa, null) === sourceHash(ev, obs, after, qa, null));
  ok("F4xF11 changing a note DOES change the fingerprint", sourceHash(ev, obs, before, qa, null) !== sourceHash(ev, [{ cleaned_note: "pressed poorly" }], before, qa, null));
}

// ---- F4: coach structured check ----------------------------------------------
const coachStructured = (c) => !!(
  c.headline || (Array.isArray(c.aims_review) && c.aims_review.length) ||
  (Array.isArray(c.what_went_well) && c.what_went_well.length) ||
  (Array.isArray(c.what_did_not_work) && c.what_did_not_work.length) ||
  (Array.isArray(c.noted_for_next) && c.noted_for_next.length));
ok("F4 coach structured when fields present", coachStructured({ what_went_well: ["x"] }) === true);
ok("F4 coach unstructured when empty -> fallback path", coachStructured({}) === false);

// ---- F4: write-back mapping (report keys -> reflection columns) ---------------
const mapBack = (c) => ({
  what_went_well: Array.isArray(c.what_went_well) ? c.what_went_well : [],
  suggested_next_focus: Array.isArray(c.noted_for_next) ? c.noted_for_next : [],
  hoped_to_see_review: Array.isArray(c.aims_review) ? c.aims_review : [],
});
{
  const m = mapBack({ noted_for_next: ["hold press"], aims_review: [{ aim: "press", status: "recorded" }], what_went_well: ["good shape"] });
  ok("F4 noted_for_next -> suggested_next_focus", m.suggested_next_focus[0] === "hold press");
  ok("F4 aims_review -> hoped_to_see_review", m.hoped_to_see_review[0].status === "recorded");
  ok("F4 empty fields map to [] (never null)", JSON.stringify(mapBack({}).what_went_well) === "[]");
}

// ---- F4: aim with no note is KEPT, labelled "stated, not recorded" ------------
const coachMarkdown = (title, c) => {
  const lines = [`# ${title}`]; if (c.headline) lines.push(`\n_${c.headline}_`);
  if (c.aims_review?.length) {
    const mark = (st) => st === "recorded" ? "✓" : st === "partly" ? "~" : "○";
    lines.push(`\n## What you hoped to see`);
    for (const a of c.aims_review) {
      const flag = a.status === "stated_not_recorded" ? " (stated, not recorded)" : "";
      lines.push(`- ${mark(a.status)} **${a.aim}**${flag}${a.note ? `: ${a.note}` : ""}`);
    }
  }
  return lines.join("\n");
};
{
  const md = coachMarkdown("Session", { aims_review: [
    { aim: "scanning", status: "stated_not_recorded" },
    { aim: "press", status: "recorded", note: "fired early" },
  ] });
  ok("F4 stated-not-recorded aim kept + labelled", md.includes("scanning") && md.includes("stated, not recorded"));
  ok("F4 recorded aim rendered with its note", md.includes("press") && md.includes("fired early"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
