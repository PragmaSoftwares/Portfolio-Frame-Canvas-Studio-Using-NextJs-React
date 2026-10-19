import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { readScrollVideo, updateScrollVideo, deleteScrollVideo, type ScrollVideoPatch } from "@/lib/storage/scrollVideos";
import type { ScrollVideoClip, ScrollVideoTransition } from "@/types/scrollVideo";

export const runtime = "nodejs";

const TRANSITIONS: ScrollVideoTransition[] = [
  "cut",
  "fade",
  "slideUp",
  "slideDown",
  "slideLeft",
  "slideRight",
  "wipeUp",
  "wipeDown",
  "wipeLeft",
  "wipeRight",
  "zoom",
  "flip",
];

function parseClips(raw: unknown): ScrollVideoClip[] | null {
  if (!Array.isArray(raw)) return null;
  const clips: ScrollVideoClip[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const e = entry as Record<string, unknown>;
    if (
      typeof e.selectionId !== "string" ||
      typeof e.pageSlug !== "string" ||
      typeof e.transitionAfter !== "string" ||
      !TRANSITIONS.includes(e.transitionAfter as ScrollVideoTransition) ||
      typeof e.transitionDurationSec !== "number" ||
      e.transitionDurationSec < 0 ||
      typeof e.scrollSpeedPxPerSec !== "number" ||
      e.scrollSpeedPxPerSec <= 0
    ) {
      return null;
    }
    clips.push({
      selectionId: e.selectionId,
      pageSlug: e.pageSlug,
      transitionAfter: e.transitionAfter as ScrollVideoTransition,
      transitionDurationSec: e.transitionDurationSec,
      scrollSpeedPxPerSec: e.scrollSpeedPxPerSec,
    });
  }
  return clips;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  const { id: rawId, videoId: rawVideoId } = await params;
  let projectId: string;
  let videoId: string;
  try {
    projectId = assertSafeId(rawId);
    videoId = assertSafeId(rawVideoId);
  } catch {
    return NextResponse.json({ error: "That id looks invalid." }, { status: 400 });
  }

  const video = await readScrollVideo(projectId, videoId);
  if (!video) return NextResponse.json({ error: "Scroll video not found." }, { status: 404 });
  return NextResponse.json({ video });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  const { id: rawId, videoId: rawVideoId } = await params;
  let projectId: string;
  let videoId: string;
  try {
    projectId = assertSafeId(rawId);
    videoId = assertSafeId(rawVideoId);
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

  const existing = await readScrollVideo(projectId, videoId);
  if (!existing) return NextResponse.json({ error: "Scroll video not found." }, { status: 404 });

  const patch: ScrollVideoPatch = {};

  if ("name" in record) {
    if (typeof record.name !== "string" || record.name.trim().length === 0) {
      return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
    }
    patch.name = record.name.trim();
  }

  if ("clips" in record) {
    const clips = parseClips(record.clips);
    if (!clips) return NextResponse.json({ error: "Invalid clips array." }, { status: 400 });
    patch.clips = clips;
  }

  if ("fps" in record) {
    if (typeof record.fps !== "number" || record.fps <= 0) {
      return NextResponse.json({ error: "fps must be a positive number." }, { status: 400 });
    }
    patch.fps = record.fps;
  }

  if ("resolutionWidth" in record) {
    if (typeof record.resolutionWidth !== "number" || record.resolutionWidth < 100) {
      return NextResponse.json({ error: "resolutionWidth looks invalid." }, { status: 400 });
    }
    patch.resolutionWidth = record.resolutionWidth;
  }

  if ("scrollSpeedPxPerSec" in record) {
    if (typeof record.scrollSpeedPxPerSec !== "number" || record.scrollSpeedPxPerSec <= 0) {
      return NextResponse.json({ error: "scrollSpeedPxPerSec must be a positive number." }, { status: 400 });
    }
    patch.scrollSpeedPxPerSec = record.scrollSpeedPxPerSec;
  }

  const video = await updateScrollVideo(projectId, videoId, patch);
  if (!video) return NextResponse.json({ error: "Scroll video not found." }, { status: 404 });
  return NextResponse.json({ video });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  const { id: rawId, videoId: rawVideoId } = await params;
  let projectId: string;
  let videoId: string;
  try {
    projectId = assertSafeId(rawId);
    videoId = assertSafeId(rawVideoId);
  } catch {
    return NextResponse.json({ error: "That id looks invalid." }, { status: 400 });
  }

  const existing = await readScrollVideo(projectId, videoId);
  if (!existing) return NextResponse.json({ error: "Scroll video not found." }, { status: 404 });

  await deleteScrollVideo(projectId, videoId);
  return NextResponse.json({ ok: true });
}
