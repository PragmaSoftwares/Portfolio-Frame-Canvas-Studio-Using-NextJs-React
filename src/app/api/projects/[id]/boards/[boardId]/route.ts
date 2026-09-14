import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { readBoard, updateBoard, deleteBoard, type BoardPatch } from "@/lib/storage/boards";
import { readBackgroundImage } from "@/lib/storage/backgroundImages";
import type { BackgroundFit, CanvasItem, FrameVariant } from "@/types/board";

export const runtime = "nodejs";

const FRAME_VARIANTS: FrameVariant[] = ["desktop", "laptop", "tablet", "mobile", "none"];
const BACKGROUND_FITS: BackgroundFit[] = ["cover", "repeat", "stretch"];

function parseItems(raw: unknown): CanvasItem[] | null {
  if (!Array.isArray(raw)) return null;
  const items: CanvasItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const e = entry as Record<string, unknown>;
    if (
      typeof e.id !== "string" ||
      typeof e.pageSlug !== "string" ||
      typeof e.selectionId !== "string" ||
      typeof e.x !== "number" ||
      typeof e.y !== "number" ||
      typeof e.width !== "number" ||
      typeof e.height !== "number" ||
      typeof e.zIndex !== "number" ||
      typeof e.frame !== "string" ||
      !FRAME_VARIANTS.includes(e.frame as FrameVariant)
    ) {
      return null;
    }
    items.push({
      id: e.id,
      pageSlug: e.pageSlug,
      selectionId: e.selectionId,
      x: e.x,
      y: e.y,
      width: Math.max(20, e.width),
      height: Math.max(20, e.height),
      zIndex: e.zIndex,
      frame: e.frame as FrameVariant,
    });
  }
  return items;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; boardId: string }> }) {
  const { id: rawId, boardId: rawBoardId } = await params;
  let projectId: string;
  let boardId: string;
  try {
    projectId = assertSafeId(rawId);
    boardId = assertSafeId(rawBoardId);
  } catch {
    return NextResponse.json({ error: "That id looks invalid." }, { status: 400 });
  }

  const board = await readBoard(projectId, boardId);
  if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });
  return NextResponse.json({ board });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; boardId: string }> }) {
  const { id: rawId, boardId: rawBoardId } = await params;
  let projectId: string;
  let boardId: string;
  try {
    projectId = assertSafeId(rawId);
    boardId = assertSafeId(rawBoardId);
  } catch {
    return NextResponse.json({ error: "That id looks invalid." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const existing = await readBoard(projectId, boardId);
  if (!existing) return NextResponse.json({ error: "Board not found." }, { status: 404 });

  const patch: BoardPatch = {};

  if ("name" in record) {
    if (typeof record.name !== "string" || record.name.trim().length === 0) {
      return NextResponse.json({ error: "Board name can't be empty." }, { status: 400 });
    }
    patch.name = record.name.trim();
  }

  if ("background" in record) {
    if (record.background !== "dark" && record.background !== "light" && record.background !== "image") {
      return NextResponse.json({ error: 'background must be "dark", "light", or "image".' }, { status: 400 });
    }
    patch.background = record.background;
  }

  if ("backgroundImageId" in record) {
    if (record.backgroundImageId === null) {
      patch.backgroundImageId = null;
    } else if (typeof record.backgroundImageId === "string") {
      const image = await readBackgroundImage(record.backgroundImageId);
      if (!image) {
        return NextResponse.json({ error: "That background image no longer exists." }, { status: 400 });
      }
      patch.backgroundImageId = image.id;
    } else {
      return NextResponse.json({ error: "Invalid backgroundImageId." }, { status: 400 });
    }
  }

  if ("backgroundFit" in record) {
    if (typeof record.backgroundFit !== "string" || !BACKGROUND_FITS.includes(record.backgroundFit as BackgroundFit)) {
      return NextResponse.json({ error: "backgroundFit must be one of cover, repeat, stretch." }, { status: 400 });
    }
    patch.backgroundFit = record.backgroundFit as BackgroundFit;
  }

  const resolvedBackground = patch.background ?? existing.background;
  if (resolvedBackground === "image") {
    const resolvedImageId = patch.backgroundImageId === null ? undefined : (patch.backgroundImageId ?? existing.backgroundImageId);
    if (!resolvedImageId) {
      return NextResponse.json({ error: "An image background needs a backgroundImageId." }, { status: 400 });
    }
  }

  if ("items" in record) {
    const items = parseItems(record.items);
    if (!items) {
      return NextResponse.json({ error: "Invalid items array." }, { status: 400 });
    }
    patch.items = items;
  }

  const board = await updateBoard(projectId, boardId, patch);
  if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });
  return NextResponse.json({ board });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; boardId: string }> }) {
  const { id: rawId, boardId: rawBoardId } = await params;
  let projectId: string;
  let boardId: string;
  try {
    projectId = assertSafeId(rawId);
    boardId = assertSafeId(rawBoardId);
  } catch {
    return NextResponse.json({ error: "That id looks invalid." }, { status: 400 });
  }

  const existing = await readBoard(projectId, boardId);
  if (!existing) return NextResponse.json({ error: "Board not found." }, { status: 404 });

  await deleteBoard(projectId, boardId);
  return NextResponse.json({ ok: true });
}
