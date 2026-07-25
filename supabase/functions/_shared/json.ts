// =============================================================================
// _shared/json.ts — single source for the "extract JSON from a model reply"
// helper that was copy-pasted across the edge functions. Models sometimes wrap
// JSON in prose or code fences, so we take the first {...} object or [...] array
// and parse it. Never throws: returns {} / [] on any failure, exactly as the
// original per-function safeParse helpers did.
// =============================================================================

export function firstJsonObject<T = Record<string, unknown>>(raw: string): T {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

export function firstJsonArray<T = unknown>(raw: string): T[] {
  try {
    const m = raw.match(/\[[\s\S]*\]/);
    return m ? (JSON.parse(m[0]) as T[]) : [];
  } catch {
    return [];
  }
}
