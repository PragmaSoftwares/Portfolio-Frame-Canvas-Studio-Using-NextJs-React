/**
 * Normalizes a project's tags from an API request body: trims each entry,
 * drops empty strings, and de-duplicates case-insensitively (keeping the
 * first-seen casing) — so "Marketing" and "marketing" typed on different
 * occasions don't end up as two separate tags in the aggregate list GET
 * /api/tags returns. Returns null when the input isn't even a string array,
 * so callers can tell "no tags" apart from "malformed request".
 */
export function normalizeTags(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
