import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { assertSafeId, projectScrollVideoOutputPath } from "@/lib/storage/paths";
import { readScrollVideo, updateScrollVideo } from "@/lib/storage/scrollVideos";

export const runtime = "nodejs";

// Discards just the rendered .mp4 — used for the partial file a cancelled or
// timed-out render can leave behind (see finalizeInterruptedRender on the
// render route): the user wants to throw that one away without losing the
// sequence/clip editing work it came from, unlike DELETE on the video
// itself, which removes the whole record.
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
  if (existing.status === "queued" || existing.status === "rendering" || existing.status === "stopping") {
    return NextResponse.json({ error: "Cancel the render before deleting its output." }, { status: 400 });
  }

  await fs.rm(projectScrollVideoOutputPath(projectId, videoId), { force: true });
  const video = await updateScrollVideo(projectId, videoId, {
    status: "draft",
    durationSec: null,
    sizeBytes: null,
    error: null,
  });
  return NextResponse.json({ video: video ?? existing });
}
