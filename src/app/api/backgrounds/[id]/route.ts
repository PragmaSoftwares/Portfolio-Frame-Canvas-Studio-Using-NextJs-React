import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { readBackgroundImage, deleteBackgroundImage } from "@/lib/storage/backgroundImages";
import { clearBackgroundImageFromAllBoards } from "@/lib/storage/boards";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  let id: string;
  try {
    id = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That id looks invalid." }, { status: 400 });
  }

  const existing = await readBackgroundImage(id);
  if (!existing) return NextResponse.json({ error: "Background image not found." }, { status: 404 });

  await deleteBackgroundImage(id);
  // Any board across any project using this image falls back to the default
  // dark background rather than being left pointing at a deleted file.
  await clearBackgroundImageFromAllBoards(id);

  return NextResponse.json({ ok: true });
}
