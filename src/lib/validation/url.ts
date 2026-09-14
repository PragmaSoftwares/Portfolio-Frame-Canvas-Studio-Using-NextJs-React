import { z } from "zod";

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlValidationError";
  }
}

const urlSchema = z.string().trim().min(1, "Enter a website URL.").url("That doesn't look like a valid URL.");

// Private/loopback/link-local ranges we refuse to capture in production use.
// Development can be permitted later via an explicit settings flag (not implemented in Phase 1).
const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::1"]);

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith(".local")) return true;
  if (isPrivateIPv4(lower)) return true;
  if (lower === "[::1]" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }
  return false;
}

/**
 * Validates a user-supplied website URL for capture.
 * Throws UrlValidationError with a human-readable message on failure.
 */
export function validateCaptureUrl(rawUrl: string): URL {
  const result = urlSchema.safeParse(rawUrl);
  if (!result.success) {
    throw new UrlValidationError(result.error.issues[0]?.message ?? "That doesn't look like a valid URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(result.data);
  } catch {
    throw new UrlValidationError("That doesn't look like a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlValidationError("Only http:// and https:// URLs are supported.");
  }

  if (isPrivateHostname(parsed.hostname)) {
    throw new UrlValidationError("Local or private network addresses can't be captured.");
  }

  return parsed;
}
