import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { assertSafeId, projectCaptureSelectionsDir, projectScrollVideoOutputPath } from "@/lib/storage/paths";
import { readProject } from "@/lib/storage/projects";
import { listAllSelections } from "@/lib/storage/review";
import { readScrollVideo, updateScrollVideo } from "@/lib/storage/scrollVideos";
import { getFfmpegStatus, probeVideoFile } from "@/lib/video/ffmpeg";
import { renderScrollVideo, RenderError, type RenderClipInput } from "@/lib/video/renderScrollVideo";
import { registerCapture, unregisterCapture } from "@/lib/capture/cancelRegistry";
import { requestCaptureSlot } from "@/lib/capture/globalQueue";
import { queueKey, registerRenderControl, unregisterRenderControl } from "@/lib/video/renderControlRegistry";

export const runtime = "nodejs";

// Reached when a render was asked to stop (Cancel) or hit the hard timeout —
// either way, renderScrollVideo.ts already tried a graceful ffmpeg stop
// first, which (unlike a hard kill) can leave behind a real, finished,
// playable file for whatever had already been encoded. "Stopped" isn't the
// same as "stopped with nothing to show for it", so this probes the actual
// file before deciding which one happened — the same reasoning as
// scrollVideos.ts's healIfStale, applied to a cancellation this process
// itself just saw happen instead of one discovered later on a cold read.
async function finalizeInterruptedRender(projectId: string, videoId: string, err: RenderError) {
  const outputPath = projectScrollVideoOutputPath(projectId, videoId);
  const probed = await probeVideoFile(outputPath);
  if (probed) {
    await updateScrollVideo(projectId, videoId, {
      status: "cancelled",
      durationSec: probed.durationSec,
      sizeBytes: probed.sizeBytes,
      renderProgressPercent: null,
      estimatedSecondsRemaining: null,
      error:
        err.reason === "timeout"
          ? "Stopped automatically for taking too long — the video below is what had rendered so far."
          : "Cancelled — the video below is what had rendered before it stopped.",
    });
    return;
  }
  // No usable moov-complete file resulted (e.g. it was force-killed before
  // the graceful stop had a chance, or before any frame finished encoding)
  // — nothing worth keeping, so don't leave a broken, unplayable .mp4 file
  // sitting in the project's exports.
  await fs.rm(outputPath, { force: true });
  await updateScrollVideo(projectId, videoId, {
    status: "cancelled",
    durationSec: null,
    sizeBytes: null,
    renderProgressPercent: null,
    estimatedSecondsRemaining: null,
    error:
      err.reason === "timeout"
        ? "Stopped automatically for taking too long, before any usable video was produced."
        : "Cancelled before any usable video was produced.",
  });
}

async function runRender(
  projectId: string,
  videoId: string,
  clips: RenderClipInput[],
  fps: number,
  resolutionWidth: number,
  signal: AbortSignal
) {
  try {
    const result = await renderScrollVideo({
      clips,
      fps,
      resolutionWidth,
      outputPath: projectScrollVideoOutputPath(projectId, videoId),
      signal,
      onProcessStart: (controls) => registerRenderControl(videoId, controls.forceKill),
      onProgress: (progress) => {
        updateScrollVideo(projectId, videoId, {
          renderProgressPercent: progress.percent,
          estimatedSecondsRemaining: progress.estimatedSecondsRemaining ?? null,
        }).catch(() => {});
      },
    });
    await updateScrollVideo(projectId, videoId, {
      status: "ready",
      durationSec: result.durationSec,
      sizeBytes: result.sizeBytes,
      renderProgressPercent: null,
      estimatedSecondsRemaining: null,
      error: null,
    });
  } catch (err) {
    if (err instanceof RenderError && (err.reason === "cancelled" || err.reason === "timeout")) {
      await finalizeInterruptedRender(projectId, videoId, err);
    } else {
      const message = err instanceof RenderError ? err.message : "Render failed unexpectedly.";
      if (!(err instanceof RenderError)) console.error("Scroll video render failed:", err);
      await updateScrollVideo(projectId, videoId, {
        status: "failed",
        error: message,
        renderProgressPercent: null,
        estimatedSecondsRemaining: null,
      });
    }
  } finally {
    unregisterRenderControl(videoId);
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  const { id: rawId, videoId: rawVideoId } = await params;
  let projectId: string;
  let videoId: string;
  try {
    projectId = assertSafeId(rawId);
    videoId = assertSafeId(rawVideoId);
  } catch {
    return NextResponse.json({ error: "That id looks invalid." }, { status: 400 });
  }

  const project = await readProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const video = await readScrollVideo(projectId, videoId);
  if (!video) return NextResponse.json({ error: "Scroll video not found." }, { status: 404 });

  if (video.clips.length === 0) {
    return NextResponse.json({ error: "Add at least one screenshot before exporting." }, { status: 400 });
  }

  const ffmpeg = await getFfmpegStatus();
  if (!ffmpeg.available) {
    return NextResponse.json({ error: "ffmpeg isn't installed on this server — see the setup instructions on this page." }, { status: 503 });
  }

  const controller = registerCapture(projectId, queueKey(videoId));
  if (!controller) {
    return NextResponse.json({ error: "This video is already being rendered." }, { status: 409 });
  }

  // Resolve each clip's selectionId to its actual cropped file + real pixel
  // dimensions (already stored on the selection — no need to re-probe it).
  const allSelections = await listAllSelections(projectId, project.approvedPages);
  const selectionsById = new Map(allSelections.map((s) => [s.id, s]));
  const missing = video.clips.filter((c) => !selectionsById.has(c.selectionId));
  if (missing.length > 0) {
    unregisterCapture(projectId, queueKey(videoId));
    return NextResponse.json(
      { error: "One or more screenshots in this sequence no longer exist — remove and re-add them." },
      { status: 400 }
    );
  }

  const clips: RenderClipInput[] = video.clips.map((c) => {
    const sel = selectionsById.get(c.selectionId)!;
    return {
      filePath: path.join(projectCaptureSelectionsDir(projectId), sel.filename),
      width: sel.width,
      height: sel.height,
      transitionAfter: c.transitionAfter,
      transitionDurationSec: c.transitionDurationSec,
      scrollSpeedPxPerSec: c.scrollSpeedPxPerSec,
    };
  });

  const slot = requestCaptureSlot(projectId, queueKey(videoId));

  if (!slot.immediate) {
    const queuedVideo = await updateScrollVideo(projectId, videoId, { status: "queued", error: null });
    slot.ready
      .then(async (releaseSlot) => {
        try {
          if (controller.signal.aborted) return;
          await updateScrollVideo(projectId, videoId, { status: "rendering" });
          await runRender(projectId, videoId, clips, video.fps, video.resolutionWidth, controller.signal);
        } finally {
          releaseSlot();
          unregisterCapture(projectId, queueKey(videoId));
        }
      })
      .catch((err) => {
        console.error("Background scroll video render failed:", err);
        unregisterCapture(projectId, queueKey(videoId));
      });

    return NextResponse.json({ video: queuedVideo, queued: true, position: slot.position }, { status: 202 });
  }

  // Fire-and-forget, same as the queued branch above — the response returns
  // as soon as the render has STARTED, not once it's finished. Awaiting
  // runRender() here directly used to block this response for the render's
  // entire duration, which left the Export button showing "Starting…" and
  // no progress bar the whole time (the client's fetch() doesn't resolve
  // until this handler returns) — only a page refresh picked the real,
  // already-correct server-side "rendering" state back up in the meantime.
  await updateScrollVideo(projectId, videoId, { status: "rendering", error: null });
  slot.ready
    .then(async (releaseSlot) => {
      try {
        await runRender(projectId, videoId, clips, video.fps, video.resolutionWidth, controller.signal);
      } finally {
        releaseSlot();
        unregisterCapture(projectId, queueKey(videoId));
      }
    })
    .catch((err) => {
      console.error("Background scroll video render failed:", err);
      unregisterCapture(projectId, queueKey(videoId));
    });

  const started = await readScrollVideo(projectId, videoId);
  return NextResponse.json({ video: started });
}
