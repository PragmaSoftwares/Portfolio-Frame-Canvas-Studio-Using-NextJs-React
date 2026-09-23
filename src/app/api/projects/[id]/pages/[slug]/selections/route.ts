import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { assertSafeId, assertSafeSlug, projectCaptureSelectionsDir, type CaptureDevice } from "@/lib/storage/paths";
import { readPageSelections, addSelection, deletePageSelections } from "@/lib/storage/review";
import { removeSelectionFromBoards } from "@/lib/storage/boards";
import { findProjectPage, isLookupError } from "@/lib/review/lookup";

export const runtime = "nodejs";

const DEVICES = new Set(["desktop", "laptop", "tablet", "mobile"]);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // cropped desktop full-page sections can be large
const ALLOWED_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id: rawId, slug: rawSlug } = await params;
  let projectId: string;
  let pageSlug: string;
  try {
    projectId = assertSafeId(rawId);
    pageSlug = assertSafeSlug(rawSlug);
  } catch {
    return NextResponse.json({ error: "That project or page id looks invalid." }, { status: 400 });
  }

  const result = await findProjectPage(projectId, pageSlug);
  if (isLookupError(result)) return NextResponse.json({ error: result.error }, { status: result.status });

  const selections = await readPageSelections(projectId, pageSlug);
  return NextResponse.json({ selections });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id: rawId, slug: rawSlug } = await params;
  let projectId: string;
  let pageSlug: string;
  try {
    projectId = assertSafeId(rawId);
    pageSlug = assertSafeSlug(rawSlug);
  } catch {
    return NextResponse.json({ error: "That project or page id looks invalid." }, { status: 400 });
  }

  const result = await findProjectPage(projectId, pageSlug);
  if (isLookupError(result)) return NextResponse.json({ error: result.error }, { status: result.status });
  if (!result.capture || result.capture.status !== "ready") {
    return NextResponse.json({ error: "This page hasn't been captured yet." }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a cropped image upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No cropped image was provided." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That crop produced an empty image." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That crop is too large (15MB limit)." }, { status: 400 });
  }
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json({ error: "Only PNG, JPEG, or WebP crops are supported." }, { status: 400 });
  }

  const rawSourceDevice = formData.get("sourceDevice");
  if (typeof rawSourceDevice !== "string" || !DEVICES.has(rawSourceDevice)) {
    return NextResponse.json({ error: "Unknown source device." }, { status: 400 });
  }
  const sourceDevice = rawSourceDevice as CaptureDevice;

  const rawLabel = formData.get("label");
  const label = typeof rawLabel === "string" && rawLabel.trim().length > 0 ? rawLabel.trim() : "Untitled section";

  const rawCropRect = formData.get("cropRect");
  let cropRect: { x: number; y: number; width: number; height: number };
  try {
    const parsed = JSON.parse(String(rawCropRect));
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      throw new Error("bad shape");
    }
    cropRect = parsed;
  } catch {
    return NextResponse.json({ error: "Invalid crop coordinates." }, { status: 400 });
  }

  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return NextResponse.json({ error: "Invalid cropped image dimensions." }, { status: 400 });
  }

  const dir = projectCaptureSelectionsDir(projectId);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${pageSlug}-${nanoid(8)}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buffer);

  const selection = await addSelection(projectId, pageSlug, {
    label,
    sourceDevice,
    cropRect,
    filename,
    width,
    height,
  });

  return NextResponse.json({ selection }, { status: 201 });
}

/** Removes every saved crop for this page at once — the review screen's "Remove all" action. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id: rawId, slug: rawSlug } = await params;
  let projectId: string;
  let pageSlug: string;
  try {
    projectId = assertSafeId(rawId);
    pageSlug = assertSafeSlug(rawSlug);
  } catch {
    return NextResponse.json({ error: "That project or page id looks invalid." }, { status: 400 });
  }

  const result = await findProjectPage(projectId, pageSlug);
  if (isLookupError(result)) return NextResponse.json({ error: result.error }, { status: result.status });

  const selections = await readPageSelections(projectId, pageSlug);
  await deletePageSelections(projectId, pageSlug);
  // Sequential, not Promise.all — each call re-reads and rewrites every board
  // file for this project, so running them concurrently could have one
  // call's write clobber another's for a board that used more than one of
  // these selections.
  for (const selection of selections) {
    await removeSelectionFromBoards(projectId, selection.id);
  }

  return NextResponse.json({ ok: true, removed: selections.length });
}
