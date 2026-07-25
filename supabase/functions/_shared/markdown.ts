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
  | { t: "bullets"; heading: string; items: string[] }
  | { t: "sections"; sections: { heading: string; points?: string[] }[] }
  | {
    t: "checklist";
    heading: string;
    items: { mark: string; label: string; suffix?: string; note?: string | null }[];
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
      for (const p of b.items) lines.push(`- ${p}`);
    } else if (b.t === "sections") {
      for (const s of b.sections) {
        lines.push(`\n## ${s.heading}`);
        for (const p of s.points ?? []) lines.push(`- ${p}`);
      }
    } else if (b.t === "checklist") {
      lines.push(`\n## ${b.heading}`);
      for (const it of b.items) {
        lines.push(`- ${it.mark} **${it.label}**${it.suffix ?? ""}${it.note ? `: ${it.note}` : ""}`);
      }
    }
  }
  return lines.join("\n");
}
