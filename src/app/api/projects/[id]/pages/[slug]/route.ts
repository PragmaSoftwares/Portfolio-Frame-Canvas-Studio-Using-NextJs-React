import { NextResponse } from "next/server";
import { assertSafeId, assertSafeSlug } from "@/lib/storage/paths";
import { removeApprovedPage } from "@/lib/storage/pages";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id: rawId, slug: rawSlug } = await params;

  let projectId: string;
  let slug: string;
  try {
    projectId = assertSafeId(rawId);
    slug = assertSafeSlug(rawSlug);
  } catch {
    return NextResponse.json({ error: "That project or page id looks invalid." }, { status: 400 });
  }

  try {
    const project = await removeApprovedPage(projectId, slug);
    return NextResponse.json({ project });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not remove that page.";
    const status = message === "Project not found." || message === "Page not found on this project." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
