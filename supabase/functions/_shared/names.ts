// =============================================================================
// _shared/names.ts — under-18 name privacy.
// Youth players are referred to by FIRST NAME ONLY, with a last initial added
// only to disambiguate two players who share a first name ("Michael S" /
// "Michael B"). Keyed off the team age group already captured (no DOB collected).
// Unknown / non-numeric age group is treated as under-18 (protective default).
// =============================================================================

export function isUnder18(ageGroup: string | null | undefined): boolean {
  if (!ageGroup) return true; // unknown -> protective
  const m = String(ageGroup).match(/(\d{1,2})/);
  if (!m) return true; // e.g. "Youth", "Juniors" -> protective
  // "U18" denotes an under-18 age group (players are minors), so <= 18 is
  // protected; U19/U21/U23 and Open are adult groups.
  return parseInt(m[1], 10) <= 18;
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
