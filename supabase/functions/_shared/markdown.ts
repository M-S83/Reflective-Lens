// =============================================================================
// _shared/markdown.ts — one report renderer.
// The report markdown builders were near-identical copies across the report
// functions: a title, an optional italic headline, then an ordered series of
// blocks (a paragraph, a bulleted section, a sections group, or a checklist).
// Each report composes its own ordered blocks; this renders them. The per-report
// wording (headings) lives in the caller, so output stays identical to the old
// hand-written renderers (proven byte-for-byte by the F16 check).
// =============================================================================

export type MdBlock =
  | { t: "para"; text: string }
  // `empty` is what to say when there are no items. Most sections are simply
  // omitted when empty; a section that carries it appears either way, on the
  // same honesty rule as the hoped-to-see checklist: saying "you didn't say
  // anything about this" is information, and quietly dropping the heading
  // would hide that the section exists at all.
  | { t: "bullets"; heading: string; items: string[]; empty?: string }
  | { t: "sections"; sections: { heading: string; points?: string[] }[] }
  | {
    t: "checklist";
    heading: string;
    // `mark` is optional. It earned its place when it was a tick, a tilde or a
    // cross carrying a meaning per item. When every line would carry the SAME
    // character it carries no information, and the list item already has a
    // bullet, so printing it renders two.
    items: { mark?: string; label: string; suffix?: string; note?: string | null }[];
  };

export function renderReport(
  title: string,
  headline: string | undefined | null,
  blocks: MdBlock[],
): string {
  const lines: string[] = [`# ${title}`];
  if (headline) lines.push(`\n_${headline}_`);
  for (const b of blocks) {
    if (b.t === "para") {
      lines.push(`\n${b.text}`);
    } else if (b.t === "bullets") {
      lines.push(`\n## ${b.heading}`);
      if (b.items.length === 0 && b.empty) lines.push(`_${b.empty}_`);
      for (const p of b.items) lines.push(`- ${p}`);
    } else if (b.t === "sections") {
      for (const s of b.sections) {
        lines.push(`\n## ${s.heading}`);
        for (const p of s.points ?? []) lines.push(`- ${p}`);
      }
    } else if (b.t === "checklist") {
      lines.push(`\n## ${b.heading}`);
      for (const it of b.items) {
        const mark = it.mark ? `${it.mark} ` : "";
        lines.push(`- ${mark}**${it.label}**${it.suffix ?? ""}${it.note ? `: ${it.note}` : ""}`);
      }
    }
  }
  return lines.join("\n");
}
