import { NextResponse } from "next/server";
import { validateCaptureUrl, UrlValidationError } from "@/lib/validation/url";
import { assertSafeId } from "@/lib/storage/paths";
import { addApprovedPage, PageLimitError, DuplicatePageError } from "@/lib/storage/pages";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;

  let projectId: string;
  try {
    projectId = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That project id looks invalid." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const rawUrl = record.url;
  const rawLabel = record.label;

  if (typeof rawUrl !== "string") {
    return NextResponse.json({ error: "A page URL is required." }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = validateCaptureUrl(rawUrl);
  } catch (err) {
    const message = err instanceof UrlValidationError ? err.message : "That doesn't look like a valid URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const label = typeof rawLabel === "string" ? rawLabel : undefined;

  try {
    const { project, page } = await addApprovedPage(projectId, parsedUrl.toString(), label);
    return NextResponse.json({ project, page }, { status: 201 });
  } catch (err) {
    if (err instanceof PageLimitError || err instanceof DuplicatePageError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error && err.message === "Project not found.") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
