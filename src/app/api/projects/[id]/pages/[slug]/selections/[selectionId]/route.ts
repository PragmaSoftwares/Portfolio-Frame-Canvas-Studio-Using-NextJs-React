import { NextResponse } from "next/server";
import { assertSafeId, assertSafeSlug } from "@/lib/storage/paths";
import { removeSelection } from "@/lib/storage/review";
import { removeSelectionFromBoards } from "@/lib/storage/boards";
import { findProjectPage, isLookupError } from "@/lib/review/lookup";

export const runtime = "nodejs";

const SELECTION_ID_PATTERN = /^[a-zA-Z0-9_-]{4,32}$/;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; slug: string; selectionId: string }> }
) {
  const { id: rawId, slug: rawSlug, selectionId } = await params;

  let projectId: string;
  let pageSlug: string;
  try {
    projectId = assertSafeId(rawId);
    pageSlug = assertSafeSlug(rawSlug);
  } catch {
    return NextResponse.json({ error: "That project or page id looks invalid." }, { status: 400 });
  }
  if (!SELECTION_ID_PATTERN.test(selectionId)) {
    return NextResponse.json({ error: "That selection id looks invalid." }, { status: 400 });
  }

  const result = await findProjectPage(projectId, pageSlug);
  if (isLookupError(result)) return NextResponse.json({ error: result.error }, { status: result.status });

  await removeSelection(projectId, pageSlug, selectionId);
  await removeSelectionFromBoards(projectId, selectionId);

  return NextResponse.json({ ok: true });
}
