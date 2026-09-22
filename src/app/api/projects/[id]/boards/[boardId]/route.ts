import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { readBoard, updateBoard, deleteBoard, type BoardPatch } from "@/lib/storage/boards";
import { readBackgroundImage } from "@/lib/storage/backgroundImages";
import { listCustomFrames } from "@/lib/storage/customFrames";
import type { BackgroundFit, CanvasItem, FrameVariant, TextAlign, TextTransform, VerticalAlign } from "@/types/board";
import type { CropFit } from "@/types/review";

export const runtime = "nodejs";

const FRAME_VARIANTS: FrameVariant[] = ["desktop", "laptop", "tablet", "mobile", "none", "custom"];
const BACKGROUND_FITS: BackgroundFit[] = ["cover", "repeat", "stretch"];
const CONTENT_FITS: CropFit[] = ["fit", "fill", "stretch"];
const TEXT_ALIGNS: TextAlign[] = ["left", "center", "right", "justify"];
const TEXT_TRANSFORMS: TextTransform[] = ["none", "uppercase", "lowercase", "capitalize"];
const VERTICAL_ALIGNS: VerticalAlign[] = ["top", "middle", "bottom"];
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function parseItems(raw: unknown, validCustomFrameIds: Set<string>): CanvasItem[] | null {
  if (!Array.isArray(raw)) return null;
  const items: CanvasItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const e = entry as Record<string, unknown>;

    if (
      typeof e.id !== "string" ||
      typeof e.x !== "number" ||
      typeof e.y !== "number" ||
      typeof e.width !== "number" ||
      typeof e.height !== "number" ||
      typeof e.zIndex !== "number"
    ) {
      return null;
    }

    if (e.kind === "text") {
      if (
        typeof e.text !== "string" ||
        typeof e.fontFamily !== "string" ||
        e.fontFamily.trim().length === 0 ||
        typeof e.fontSize !== "number" ||
        typeof e.bold !== "boolean" ||
        typeof e.italic !== "boolean" ||
        typeof e.underline !== "boolean" ||
        typeof e.color !== "string" ||
        !HEX_COLOR_PATTERN.test(e.color) ||
        typeof e.align !== "string" ||
        !TEXT_ALIGNS.includes(e.align as TextAlign) ||
        typeof e.letterSpacing !== "number" ||
        typeof e.lineHeight !== "number" ||
        typeof e.textTransform !== "string" ||
        !TEXT_TRANSFORMS.includes(e.textTransform as TextTransform) ||
        typeof e.verticalAlign !== "string" ||
        !VERTICAL_ALIGNS.includes(e.verticalAlign as VerticalAlign) ||
        typeof e.opacity !== "number" ||
        ("backgroundColor" in e && e.backgroundColor !== undefined && (typeof e.backgroundColor !== "string" || !HEX_COLOR_PATTERN.test(e.backgroundColor))) ||
        typeof e.textShadowBlur !== "number" ||
        typeof e.textShadowOffsetX !== "number" ||
        typeof e.textShadowOffsetY !== "number" ||
        ("textShadowColor" in e &&
          e.textShadowColor !== undefined &&
          (typeof e.textShadowColor !== "string" || !HEX_COLOR_PATTERN.test(e.textShadowColor))) ||
        typeof e.textStrokeWidth !== "number" ||
        ("textStrokeColor" in e && e.textStrokeColor !== undefined && (typeof e.textStrokeColor !== "string" || !HEX_COLOR_PATTERN.test(e.textStrokeColor)))
      ) {
        return null;
      }
      items.push({
        kind: "text",
        id: e.id,
        x: e.x,
        y: e.y,
        width: Math.max(20, e.width),
        height: Math.max(20, e.height),
        zIndex: e.zIndex,
        text: e.text,
        fontFamily: e.fontFamily,
        fontSize: Math.max(1, e.fontSize),
        bold: e.bold,
        italic: e.italic,
        underline: e.underline,
        color: e.color,
        align: e.align as TextAlign,
        letterSpacing: e.letterSpacing,
        lineHeight: Math.max(0.1, e.lineHeight),
        textTransform: e.textTransform as TextTransform,
        verticalAlign: e.verticalAlign as VerticalAlign,
        backgroundColor: typeof e.backgroundColor === "string" ? e.backgroundColor : undefined,
        opacity: Math.min(1, Math.max(0, e.opacity)),
        textShadowColor: typeof e.textShadowColor === "string" ? e.textShadowColor : undefined,
        textShadowBlur: Math.max(0, e.textShadowBlur),
        textShadowOffsetX: e.textShadowOffsetX,
        textShadowOffsetY: e.textShadowOffsetY,
        textStrokeColor: typeof e.textStrokeColor === "string" ? e.textStrokeColor : undefined,
        textStrokeWidth: Math.max(0, e.textStrokeWidth),
      });
      continue;
    }

    // Anything not explicitly "text" is a screenshot — covers both the
    // normal case (kind: "screenshot") and legacy items with no kind field
    // at all (readBoard backfills those before a client ever sees them, but
    // this stays lenient regardless, since a client only ever resends what
    // it last read).
    if (
      typeof e.pageSlug !== "string" ||
      typeof e.selectionId !== "string" ||
      typeof e.frame !== "string" ||
      !FRAME_VARIANTS.includes(e.frame as FrameVariant) ||
      (e.frame === "custom" && (typeof e.customFrameId !== "string" || !validCustomFrameIds.has(e.customFrameId))) ||
      ("contentFit" in e && (typeof e.contentFit !== "string" || !CONTENT_FITS.includes(e.contentFit as CropFit))) ||
      ("contentFitColor" in e && (typeof e.contentFitColor !== "string" || !HEX_COLOR_PATTERN.test(e.contentFitColor))) ||
      ("contentY" in e && (typeof e.contentY !== "number" || e.contentY < 0 || e.contentY > 1))
    ) {
      return null;
    }
    items.push({
      kind: "screenshot",
      id: e.id,
      pageSlug: e.pageSlug,
      selectionId: e.selectionId,
      x: e.x,
      y: e.y,
      width: Math.max(20, e.width),
      height: Math.max(20, e.height),
      zIndex: e.zIndex,
      frame: e.frame as FrameVariant,
      customFrameId: e.frame === "custom" ? (e.customFrameId as string) : undefined,
      contentFit: typeof e.contentFit === "string" ? (e.contentFit as CropFit) : undefined,
      contentFitColor: typeof e.contentFitColor === "string" ? e.contentFitColor : undefined,
      contentY: typeof e.contentY === "number" ? e.contentY : undefined,
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
    const validCustomFrameIds = new Set((await listCustomFrames()).map((f) => f.id));
    const items = parseItems(record.items, validCustomFrameIds);
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
