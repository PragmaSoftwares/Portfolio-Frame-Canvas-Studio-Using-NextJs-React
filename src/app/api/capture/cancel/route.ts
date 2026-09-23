import { NextResponse } from "next/server";
import { assertSafeId, assertSafeSlug } from "@/lib/storage/paths";
import { cancelCapture } from "@/lib/capture/cancelRegistry";

export const runtime = "nodejs";

/**
 * Signals an in-flight capture (registered by POST /api/capture) to stop at
 * its next checkpoint — see cancelRegistry.ts for why this is a separate
 * request rather than aborting the original one. Doesn't itself write any
 * capture metadata; the original /api/capture request's own catch block
 * does that once it notices, same as any other way a capture can end.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const rawId = record.projectId;
  const rawSlug = record.pageSlug;

  if (typeof rawId !== "string" || typeof rawSlug !== "string") {
    return NextResponse.json({ error: "A projectId and pageSlug are required." }, { status: 400 });
  }

  let projectId: string;
  let pageSlug: string;
  try {
    projectId = assertSafeId(rawId);
    pageSlug = assertSafeSlug(rawSlug);
  } catch {
    return NextResponse.json({ error: "That project or page id looks invalid." }, { status: 400 });
  }

  const cancelled = cancelCapture(projectId, pageSlug);
  return NextResponse.json({ cancelled });
}
