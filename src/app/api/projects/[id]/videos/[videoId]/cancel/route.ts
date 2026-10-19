import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { readScrollVideo, updateScrollVideo } from "@/lib/storage/scrollVideos";
import { cancelCapture } from "@/lib/capture/cancelRegistry";
import { queueKey, forceKillRender } from "@/lib/video/renderControlRegistry";

export const runtime = "nodejs";

// Two strengths of "stop this render", matching renderScrollVideo.ts's own
// two-stage shutdown:
//   1. A plain POST asks ffmpeg to stop gracefully (so it still finalizes a
//      valid, playable file from whatever it already encoded) — the video
//      moves to "stopping" and, within a few seconds, resolves itself into
//      "cancelled" once ffmpeg actually exits (handled by the render
//      route's finalizeInterruptedRender). This also auto-escalates to a
//      hard kill on its own after 8s if ffmpeg doesn't respond.
//   2. `{ "force": true }` skips straight to killing the ffmpeg process
//      outright — for a user who doesn't want to wait out the graceful
//      attempt, e.g. because it's visibly stuck on "Stopping…".
export async function POST(request: Request, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  const { id: rawId, videoId: rawVideoId } = await params;
  let projectId: string;
  let videoId: string;
  try {
    projectId = assertSafeId(rawId);
    videoId = assertSafeId(rawVideoId);
  } catch {
    return NextResponse.json({ error: "That id looks invalid." }, { status: 400 });
  }

  let force = false;
  try {
    const body = await request.json();
    force = typeof body === "object" && body !== null && (body as Record<string, unknown>).force === true;
  } catch {
    // No body (or a non-JSON one) just means a plain, graceful cancel.
  }

  const video = await readScrollVideo(projectId, videoId);
  if (!video) return NextResponse.json({ error: "Scroll video not found." }, { status: 404 });

  if (force) {
    // Only meaningful once a process actually exists to kill — if it
    // already finished (or was never running), there's nothing to escalate.
    forceKillRender(videoId);
    const current = await readScrollVideo(projectId, videoId);
    return NextResponse.json({ video: current ?? video });
  }

  if (video.status === "queued") {
    // Nothing is running yet — cancelling here just means "never start it".
    cancelCapture(projectId, queueKey(videoId));
    const updated = await updateScrollVideo(projectId, videoId, {
      status: "cancelled",
      error: "Cancelled before rendering started.",
    });
    return NextResponse.json({ video: updated ?? video });
  }

  if (video.status === "rendering" || video.status === "stopping") {
    const found = cancelCapture(projectId, queueKey(videoId));
    if (!found) {
      // No in-flight process in this server process — the stored status is
      // stale (e.g. left over from a process that already died). Nothing to
      // signal; a page refresh will pick up scrollVideos.ts's own
      // stale-record self-heal instead.
      return NextResponse.json({ video });
    }
    const updated = await updateScrollVideo(projectId, videoId, { status: "stopping" });
    return NextResponse.json({ video: updated ?? video });
  }

  return NextResponse.json({ error: "This video isn't currently rendering." }, { status: 400 });
}
