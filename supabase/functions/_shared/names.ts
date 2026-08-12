// =============================================================================
// _shared/names.ts — under-18 name privacy.
// Youth players are referred to by FIRST NAME ONLY, with a last initial added
// only to disambiguate two players who share a first name ("Michael S" /
// "Michael B"). Keyed off the team age group already captured (no DOB collected).
// Unknown / non-numeric age group is treated as under-18 (protective default).
// =============================================================================

// The ONLY age group treated as adult. Everything else is protected, including
// anything unrecognised.
//
// This used to read the first one or two digits out of whatever was typed, and
// the field it read is free text. Two ways that silently switched protection
// off, both of them ordinary:
//
//   "U19"    -> 19 -> adult. A U19 squad routinely contains 17-year-olds.
//   "2013s"  -> 20 -> adult. Birth-year naming is how a lot of grassroots
//               teams are known, and the regex takes the "20" off the front.
//
// When it misfires, `safeNameMap` and `stripSurnames` both stand down and
// children's full surnames go out to two third-party processors in the
// transcript. So the rule is inverted: name the adult case, protect everything
// else, and never infer an age from a number someone typed.
//
// Must stay in step with AGE_GROUPS in web/src/lib/types.ts, which is the
// picker a coach actually chooses from. The two cannot import each other (one
// is Deno, one is the bundle), so _tests/age-groups.mjs asserts they agree.
export const ADULT_AGE_GROUP = "Adult / open age";

export function isUnder18(ageGroup: string | null | undefined): boolean {
  if (!ageGroup) return true; // unknown -> protective
  return ageGroup.trim().toLowerCase() !== ADULT_AGE_GROUP.toLowerCase();
}

export interface PlayerRec {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
}

// Split a player record into first + last, falling back to the display name when
// first/last are not stored (players added via the app carry only display_name).
function parts(p: PlayerRec): { first: string; last: string } {
  let first = (p.first_name ?? "").trim();
  let last = (p.last_name ?? "").trim();
  if (!first && p.display_name) {
    const toks = String(p.display_name).trim().split(/\s+/);
    first = toks[0] ?? "";
    if (!last && toks.length > 1) last = toks[toks.length - 1];
  }
  return { first, last };
}

// One safe label for a single player (no disambiguation context).
export function safeName(p: PlayerRec, under18: boolean): string {
  const { first, last } = parts(p);
  if (!under18) return (p.display_name ?? [first, last].filter(Boolean).join(" ")) || "A player";
  return first || "A player";
}

// Map player id -> the label to show/send. First-name-only for under-18, with a
// last initial ONLY where a first name repeats in the group; full name otherwise.
export function safeNameMap(players: PlayerRec[], under18: boolean): Record<string, string> {
  const map: Record<string, string> = {};
  if (!under18) {
    for (const p of players) if (p.id) map[p.id] = safeName(p, false);
    return map;
  }
  const firstCounts: Record<string, number> = {};
  for (const p of players) {
    const f = parts(p).first.toLowerCase();
    if (f) firstCounts[f] = (firstCounts[f] ?? 0) + 1;
  }
  for (const p of players) {
    if (!p.id) continue;
    const { first, last } = parts(p);
    if (!first) { map[p.id] = "A player"; continue; }
    const li = last.slice(0, 1);
    map[p.id] = (firstCounts[first.toLowerCase()] > 1 && li) ? `${first} ${li}` : first;
  }
  return map;
}

// Light surname strip for a transcript: remove squad surnames (word-boundary,
// case-insensitive) so a spoken surname does not slip through. First names stay.
// Deliberately conservative: only strips exact last-name tokens of length >= 2.
export function stripSurnames(text: string, players: PlayerRec[]): string {
  const surnames = new Set<string>();
  for (const p of players) {
    const last = parts(p).last;
    if (last && last.length >= 2) surnames.add(last);
  }
  let out = text;
  for (const s of surnames) {
    const esc = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\s*\\b${esc}\\b`, "gi"), "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}
