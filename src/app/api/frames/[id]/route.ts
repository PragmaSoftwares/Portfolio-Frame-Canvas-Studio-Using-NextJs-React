import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { readCustomFrame, deleteCustomFrame, updateCustomFrame } from "@/lib/storage/customFrames";
import { clearCustomFrameFromAllBoardItems } from "@/lib/storage/boards";
import { parseFrameScreenQuad } from "@/lib/canvas/quadValidation";

export const runtime = "nodejs";

/** Corrects an existing frame's screen corners (and optionally renames it) — see updateCustomFrame. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  let id: string;
  try {
    id = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That id looks invalid." }, { status: 400 });
  }

  const existing = await readCustomFrame(id);
  if (!existing) return NextResponse.json({ error: "Frame not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const { quad: rawQuad, name } = (body ?? {}) as { quad?: unknown; name?: unknown };
  const quad = parseFrameScreenQuad(rawQuad);
  if (!quad) return NextResponse.json({ error: "The frame's 4 screen corners are required." }, { status: 400 });

  const frame = await updateCustomFrame(id, quad, typeof name === "string" ? name : undefined);
  if (!frame) return NextResponse.json({ error: "Frame not found." }, { status: 404 });

  return NextResponse.json({ frame });
}

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
