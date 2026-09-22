import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { readCustomFrame, deleteCustomFrame } from "@/lib/storage/customFrames";
import { clearCustomFrameFromAllBoardItems } from "@/lib/storage/boards";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  let id: string;
  try {
    id = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That id looks invalid." }, { status: 400 });
  }

  const existing = await readCustomFrame(id);
  if (!existing) return NextResponse.json({ error: "Frame not found." }, { status: 404 });

  await deleteCustomFrame(id);
  // Any item across any project using this frame falls back to frameless
  // rather than being left pointing at a deleted frame.
  await clearCustomFrameFromAllBoardItems(id);

  return NextResponse.json({ ok: true });
}
