// F16 byte-identity: the shared renderReport composition must produce EXACTLY the
// same markdown as each original hand-written renderer. This is how player_report
// and generate-player-summary output is proven unchanged.
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error("FAIL:", n); } };

// ---- shared renderer (verbatim from _shared/markdown.ts) ---------------------
function renderReport(title, headline, blocks) {
  const lines = [`# ${title}`];
  if (headline) lines.push(`\n_${headline}_`);
  for (const b of blocks) {
    if (b.t === "para") lines.push(`\n${b.text}`);
    else if (b.t === "bullets") { lines.push(`\n## ${b.heading}`); for (const p of b.items) lines.push(`- ${p}`); }
    else if (b.t === "sections") { for (const s of b.sections) { lines.push(`\n## ${s.heading}`); for (const p of s.points ?? []) lines.push(`- ${p}`); } }
    else if (b.t === "checklist") { lines.push(`\n## ${b.heading}`); for (const it of b.items) lines.push(`- ${it.mark} **${it.label}**${it.suffix ?? ""}${it.note ? `: ${it.note}` : ""}`); }
  }
  return lines.join("\n");
}

// ---- ORIGINALS (verbatim, pre-F16) ------------------------------------------
const origCoach = (title, c) => {
  const lines = [`# ${title}`]; if (c.headline) lines.push(`\n_${c.headline}_`);
  if (c.aims_review?.length) { const mark = (st) => st === "recorded" ? "✓" : st === "partly" ? "~" : "○"; lines.push(`\n## What you hoped to see`); for (const a of c.aims_review) { const flag = a.status === "stated_not_recorded" ? " (stated, not recorded)" : ""; lines.push(`- ${mark(a.status)} **${a.aim}**${flag}${a.note ? `: ${a.note}` : ""}`); } }
  const block = (h, arr) => { if (arr?.length) { lines.push(`\n## ${h}`); for (const p of arr) lines.push(`- ${p}`); } };
  block("What went well", c.what_went_well); block("What did not work", c.what_did_not_work); block("In this session", c.session_patterns); block("Action points", c.action_points); block("Noted for next", c.noted_for_next); block("Evidence of learning", c.learning_evidence);
  return lines.join("\n");
};
const origPlayerReport = (title, c) => {
  const lines = [`# ${title}`]; if (c.headline) lines.push(`\n_${c.headline}_`);
  for (const s of c.sections ?? []) { lines.push(`\n## ${s.heading}`); for (const p of s.points ?? []) lines.push(`- ${p}`); }
  if (c.hoped_to_see?.length) { const mark = (st) => st === "showed_up" ? "✓" : st === "partly" ? "~" : "✗"; lines.push(`\n## What you hoped to see`); for (const h of c.hoped_to_see) lines.push(`- ${mark(h.status)} **${h.item}**${h.note ? `: ${h.note}` : ""}`); }
  if (c.patterns?.length) { lines.push(`\n## Patterns`); for (const p of c.patterns) lines.push(`- ${p}`); }
  if (c.suggested_next_focus?.length) { lines.push(`\n## Noted for next`); for (const p of c.suggested_next_focus) lines.push(`- ${p}`); }
  return lines.join("\n");
};
const origPeriod = (title, record, c) => {
  const lines = [`# ${title}`]; if (c.headline) lines.push(`\n_${c.headline}_`);
  lines.push(`\n**Record:** ${record.wins}W ${record.draws}D ${record.losses}L · ${record.gf}-${record.ga} goals`);
  if (c.results_summary) lines.push(`\n${c.results_summary}`);
  for (const s of c.sections ?? []) { lines.push(`\n## ${s.heading}`); for (const p of s.points ?? []) lines.push(`- ${p}`); }
  if (c.player_highlights?.length) { lines.push(`\n## Player highlights`); for (const p of c.player_highlights) lines.push(`- ${p}`); }
  if (c.recurring_themes?.length) { lines.push(`\n## Recurring themes`); for (const p of c.recurring_themes) lines.push(`- ${p}`); }
  if (c.training_to_match?.length) { lines.push(`\n## Training ↔ match`); for (const p of c.training_to_match) lines.push(`- ${p}`); }
  if (c.focus_ahead?.length) { lines.push(`\n## Focus ahead`); for (const p of c.focus_ahead) lines.push(`- ${p}`); }
  return lines.join("\n");
};
const origPlayerSummary = (title, c) => {
  const lines = [`# ${title}`]; if (c.headline) lines.push(`\n_${c.headline}_`);
  if (c.story) lines.push(`\n${c.story}`);
  const block = (h, arr) => { if (arr?.length) { lines.push(`\n## ${h}`); for (const p of arr) lines.push(`- ${p}`); } };
  block("What keeps showing in your game", c.keeps_showing); block("What you keep working on", c.keeps_working_on); block("What's shifted", c.whats_shifted); block("Focus ahead", c.focus_ahead);
  return lines.join("\n");
};

// ---- NEW composers (verbatim from the edited functions) ----------------------
const newCoach = (title, c) => {
  const blocks = [];
  if (c.aims_review?.length) { const mark = (st) => st === "recorded" ? "✓" : st === "partly" ? "~" : "○"; blocks.push({ t: "checklist", heading: "What you hoped to see", items: c.aims_review.map((a) => ({ mark: mark(a.status), label: a.aim, suffix: a.status === "stated_not_recorded" ? " (stated, not recorded)" : "", note: a.note })) }); }
  const bl = (h, arr) => { if (arr?.length) blocks.push({ t: "bullets", heading: h, items: arr }); };
  bl("What went well", c.what_went_well); bl("What did not work", c.what_did_not_work); bl("In this session", c.session_patterns); bl("Action points", c.action_points); bl("Noted for next", c.noted_for_next); bl("Evidence of learning", c.learning_evidence);
  return renderReport(title, c.headline, blocks);
};
const newPlayerReport = (title, c) => {
  const blocks = [{ t: "sections", sections: c.sections ?? [] }];
  if (c.hoped_to_see?.length) { const mark = (st) => st === "showed_up" ? "✓" : st === "partly" ? "~" : "✗"; blocks.push({ t: "checklist", heading: "What you hoped to see", items: c.hoped_to_see.map((h) => ({ mark: mark(h.status), label: h.item, note: h.note })) }); }
  if (c.patterns?.length) blocks.push({ t: "bullets", heading: "Patterns", items: c.patterns });
  if (c.suggested_next_focus?.length) blocks.push({ t: "bullets", heading: "Noted for next", items: c.suggested_next_focus });
  return renderReport(title, c.headline, blocks);
};
const newPeriod = (title, record, c) => {
  const blocks = [{ t: "para", text: `**Record:** ${record.wins}W ${record.draws}D ${record.losses}L · ${record.gf}-${record.ga} goals` }];
  if (c.results_summary) blocks.push({ t: "para", text: c.results_summary });
  blocks.push({ t: "sections", sections: c.sections ?? [] });
  const bl = (h, arr) => { if (arr?.length) blocks.push({ t: "bullets", heading: h, items: arr }); };
  bl("Player highlights", c.player_highlights); bl("Recurring themes", c.recurring_themes); bl("Training ↔ match", c.training_to_match); bl("Focus ahead", c.focus_ahead);
  return renderReport(title, c.headline, blocks);
};
const newPlayerSummary = (title, c) => {
  const blocks = [];
  if (c.story) blocks.push({ t: "para", text: c.story });
  const bl = (h, arr) => { if (arr?.length) blocks.push({ t: "bullets", heading: h, items: arr }); };
  bl("What keeps showing in your game", c.keeps_showing); bl("What you keep working on", c.keeps_working_on); bl("What's shifted", c.whats_shifted); bl("Focus ahead", c.focus_ahead);
  return renderReport(title, c.headline, blocks);
};

// ---- representative inputs ---------------------------------------------------
const coachCases = [
  { headline: "h", aims_review: [{ aim: "press", status: "recorded", note: "early" }, { aim: "scan", status: "stated_not_recorded" }, { aim: "width", status: "partly", note: "left only" }], what_went_well: ["shape"], what_did_not_work: [], session_patterns: ["clustered"], action_points: [], noted_for_next: ["hold press"], learning_evidence: ["q: a"] },
  {}, // empty
  { aims_review: [] }, // empty aims
  { headline: "only headline" },
  { what_went_well: ["a", "b"] }, // no headline, only one block
];
const playerReportCases = [
  { headline: "hr", sections: [{ heading: "Game", points: ["ran hard", "scored"] }], hoped_to_see: [{ item: "shoot more", status: "showed_up", note: "twice" }, { item: "track back", status: "not_observed" }], patterns: ["confident"], suggested_next_focus: ["first touch"] },
  {},
  { sections: [] },
  { hoped_to_see: [{ item: "x", status: "partly" }] },
];
const periodCases = [
  { rec: { wins: 3, draws: 1, losses: 2, gf: 12, ga: 9 }, c: { headline: "P", results_summary: "solid month", sections: [{ heading: "Attack", points: ["sharp"] }], player_highlights: ["#9 4 goals"], recurring_themes: ["press"], training_to_match: ["carried over"], focus_ahead: ["set pieces"] } },
  { rec: { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 }, c: {} },
  { rec: { wins: 1, draws: 0, losses: 0, gf: 2, ga: 1 }, c: { headline: "x" } },
];
const playerSummaryCases = [
  { headline: "S", story: "You grew this month.", keeps_showing: ["work rate"], keeps_working_on: ["weak foot"], whats_shifted: ["more vocal"], focus_ahead: ["finishing"] },
  {},
  { story: "just a story" },
  { keeps_showing: ["a"] },
];

for (const [i, c] of coachCases.entries()) ok(`F16 coach #${i} byte-identical`, newCoach("T", c) === origCoach("T", c));
for (const [i, c] of playerReportCases.entries()) ok(`F16 player_report #${i} byte-identical`, newPlayerReport("T", c) === origPlayerReport("T", c));
for (const [i, x] of periodCases.entries()) ok(`F16 period #${i} byte-identical`, newPeriod("T", x.rec, x.c) === origPeriod("T", x.rec, x.c));
for (const [i, c] of playerSummaryCases.entries()) ok(`F16 player_summary #${i} byte-identical`, newPlayerSummary("T", c) === origPlayerSummary("T", c));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
