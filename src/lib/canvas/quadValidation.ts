import type { FrameScreenQuad } from "@/types/frame";

function isCorner(value: unknown): value is { xPct: number; yPct: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { xPct?: unknown }).xPct === "number" &&
    typeof (value as { yPct?: unknown }).yPct === "number"
  );
}

/**
 * Validates an untrusted value as a FrameScreenQuad — accepts either an
 * already-parsed object (a JSON request body) or a JSON string of one
 * (FormData fields are always strings), since both shapes show up across
 * the frame-related API routes. Returns null for anything malformed.
 */
export function parseFrameScreenQuad(raw: unknown): FrameScreenQuad | null {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { topLeft, topRight, bottomRight, bottomLeft } = parsed as Record<string, unknown>;
  if (!isCorner(topLeft) || !isCorner(topRight) || !isCorner(bottomRight) || !isCorner(bottomLeft)) return null;
  return { topLeft, topRight, bottomRight, bottomLeft };
}
