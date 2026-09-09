// =============================================================================
// _shared/dedupe.ts: one point, one section.
//
// The trust rule from the linked-questions work, applied to reports: the same
// bullet must not appear in two sections. Repetition is the thing that exposes
// a reflection tool as not reading the notes. A real test report carried
// "understood the key players that needed to be positioned correctly" in both
// What went well and Evidence of learning, and "instigated the press a little
// early" in both What did not work and Evidence of learning.
//
// The prompt already forbids it ("EACH POINT APPEARS ONCE") and the model still
// does it, because rewording the same observation does not feel like repeating
// to a model. A rule cannot be the only defence against a failure we have
// watched happen twice, so the output is checked too.
//
// EARLIER SECTION WINS. Sections are passed in the order the report renders
// them, and a point stays where the reader meets it first. Both real
// duplicates above resolve the right way under this rule: the section that
// mislabelled them (Evidence of learning, in both cases) is the later one, so
// it is the copy that goes.
//
// NEAR-duplicates count. An exact-string check would be beaten by the very
// rewording that causes the problem, so two points are the same when the
// meaningful words of one are almost all contained in the other. Kept
// deliberately blunt: no stemming, no synonyms. A missed near-duplicate leaves
// the report no worse than today; a false positive would silently delete
// something the coach said, which is the worse failure, so the threshold errs
// toward keeping.
// =============================================================================

// Words that carry no meaning for the comparison. Small on purpose: the more
// words we ignore, the easier it is for two different points to look the same.
const STOP = new Set([
  "a", "an", "the", "to", "of", "in", "on", "at", "and", "or", "that", "this",
  "was", "were", "is", "are", "be", "been", "you", "your", "they", "their",
  "it", "its", "had", "have", "has", "with", "for", "as", "but", "not", "no",
]);

function meaningfulWords(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

// True when the two points say the same thing: nearly all the meaningful words
// of the shorter one appear in the other.
function samePoint(a: string, b: string): boolean {
  const wa = meaningfulWords(a);
  const wb = meaningfulWords(b);
  if (wa.size === 0 || wb.size === 0) return false;
  const [small, big] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  let shared = 0;
  for (const w of small) if (big.has(w)) shared++;
  return shared / small.size >= 0.8;
}

// Sections in RENDER ORDER. Returns the same shape with later duplicates
// removed, within a section as well as across sections.
export function dedupeSections(sections: string[][]): string[][] {
  const kept: string[] = [];
  return sections.map((section) =>
    (section ?? []).filter((point) => {
      if (typeof point !== "string" || !point.trim()) return false;
      if (kept.some((k) => samePoint(k, point))) return false;
      kept.push(point);
      return true;
    })
  );
}
