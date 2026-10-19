import fs from "node:fs/promises";
import path from "node:path";
import { projectScrollVideosDir, projectScrollVideoOutputPath, generateScrollVideoId, assertSafeId } from "./paths";
import { probeVideoFile } from "@/lib/video/ffmpeg";
import type { ScrollVideo, ScrollVideoClip } from "@/types/scrollVideo";

const DEFAULT_FPS = 120;
const DEFAULT_RESOLUTION_WIDTH = 1920;
const DEFAULT_SPEED_PX_PER_SEC = 450;

function metaPath(projectId: string, videoId: string): string {
  return path.join(projectScrollVideosDir(assertSafeId(projectId)), `${assertSafeId(videoId)}.json`);
}

// scrollSpeedPxPerSec was added to each clip after this feature first
// shipped — a clip saved before that has no such field at all, which
// otherwise divides-by-undefined into NaN durations and an empty input in
// the editor. Backfilled from the video's own (now "default for new clips")
// speed on read, same "fix stale data in place" pattern as
// migrateBoard()/migrateProject() use for their own schema changes.
function migrateScrollVideo(raw: Record<string, unknown>): ScrollVideo {
  if (Array.isArray(raw.clips)) {
    raw.clips = raw.clips.map((clip) => {
      if (typeof clip !== "object" || clip === null) return clip;
      const record = clip as Record<string, unknown>;
      if (typeof record.scrollSpeedPxPerSec === "number") return record;
      return { ...record, scrollSpeedPxPerSec: raw.scrollSpeedPxPerSec ?? DEFAULT_SPEED_PX_PER_SEC };
    });
  }
  return raw as unknown as ScrollVideo;
}

// A "rendering"/"queued" record can outlive the real work behind it the
// exact same way a capture's "capturing" record can (see
// lib/storage/captures.ts's own isStaleCapture) — if the server process dies
// mid-render, nothing is left running to ever update the status, and
// without this it would show as perpetually "rendering" forever.
//
// Confirmed live, the hard way: a real render here actually finished
// successfully (a complete, playable MP4 sitting on disk), but the code that
// was supposed to record "ready" never got to run — so it just LOOKED dead
// (output file no longer growing) when it had actually succeeded. "Stopped
// growing" doesn't distinguish "crashed mid-encode" from "finished", so
// before giving up, this probes the output file with ffprobe — if it's
// actually a complete, valid video, that's what really happened, and the
// record gets reconciled to "ready" using its real duration/size instead of
// being wrongly marked failed.
//
// "rendering" gets a shorter leash than "queued" since renderScrollVideo.ts
// enforces its own 10-minute hard cap — a real render can never legitimately
// still be "rendering" much past that. "queued" can legitimately wait longer
// behind other heavy jobs sharing the same global concurrency limit as
// captures. "stopping" gets the shortest leash of all: a graceful-stop
// request auto-escalates to a hard kill after 8 seconds
// (renderScrollVideo.ts's GRACE_PERIOD_MS) if ffmpeg doesn't respond, so a
// real cancellation should never still be "stopping" this long after —
// if it is, the server process itself must have died mid-shutdown.
const STALE_RENDERING_MS = 12 * 60 * 1000;
const STALE_STOPPING_MS = 2 * 60 * 1000;
const STALE_QUEUED_MS = 20 * 60 * 1000;

async function healIfStale(video: ScrollVideo): Promise<ScrollVideo> {
  const age = Date.now() - new Date(video.updatedAt).getTime();
  const stale =
    (video.status === "rendering" && age > STALE_RENDERING_MS) ||
    (video.status === "stopping" && age > STALE_STOPPING_MS) ||
    (video.status === "queued" && age > STALE_QUEUED_MS);
  if (!stale) return video;

  const wasStopping = video.status === "stopping";
  const probed =
    video.status === "rendering" || wasStopping
      ? await probeVideoFile(projectScrollVideoOutputPath(video.projectId, video.id))
      : null;

  const healed: ScrollVideo = probed
    ? {
        ...video,
        status: wasStopping ? "cancelled" : "ready",
        durationSec: probed.durationSec,
        sizeBytes: probed.sizeBytes,
        renderProgressPercent: undefined,
        estimatedSecondsRemaining: undefined,
        error: wasStopping ? "Cancelled — the video below is what had rendered before it stopped." : undefined,
        updatedAt: new Date().toISOString(),
      }
    : {
        ...video,
        status: wasStopping ? "cancelled" : "failed",
        error: wasStopping
          ? "Cancelled before any usable video was produced."
          : "This render was interrupted (e.g. a server restart) and never finished — try exporting again.",
        renderProgressPercent: undefined,
        estimatedSecondsRemaining: undefined,
        updatedAt: new Date().toISOString(),
      };
  await writeScrollVideo(healed);
  return healed;
}

export async function listScrollVideos(projectId: string): Promise<ScrollVideo[]> {
  let entries;
  try {
    entries = await fs.readdir(projectScrollVideosDir(assertSafeId(projectId)), { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const videos: ScrollVideo[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(projectScrollVideosDir(projectId), entry.name), "utf-8");
      videos.push(await healIfStale(migrateScrollVideo(JSON.parse(raw) as Record<string, unknown>)));
    } catch {
      // Skip unreadable/corrupt files rather than failing the whole list.
    }
  }
  videos.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return videos;
}

export async function readScrollVideo(projectId: string, videoId: string): Promise<ScrollVideo | null> {
  try {
    const raw = await fs.readFile(metaPath(projectId, videoId), "utf-8");
    return await healIfStale(migrateScrollVideo(JSON.parse(raw) as Record<string, unknown>));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeScrollVideo(video: ScrollVideo): Promise<void> {
  const dir = projectScrollVideosDir(video.projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(metaPath(video.projectId, video.id), JSON.stringify(video, null, 2), "utf-8");
}

export async function createScrollVideo(projectId: string, name: string): Promise<ScrollVideo> {
  const now = new Date().toISOString();
  const video: ScrollVideo = {
    id: generateScrollVideoId(),
    projectId: assertSafeId(projectId),
    name,
    clips: [],
    fps: DEFAULT_FPS,
    resolutionWidth: DEFAULT_RESOLUTION_WIDTH,
    scrollSpeedPxPerSec: DEFAULT_SPEED_PX_PER_SEC,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  await writeScrollVideo(video);
  return video;
}

export interface ScrollVideoPatch {
  name?: string;
  clips?: ScrollVideoClip[];
  fps?: number;
  resolutionWidth?: number;
  scrollSpeedPxPerSec?: number;
  status?: ScrollVideo["status"];
  renderProgressPercent?: number | null;
  estimatedSecondsRemaining?: number | null;
  error?: string | null;
  // null explicitly clears a stale result from a previous render attempt —
  // needed when a cancelled/timed-out render turns out NOT to have produced
  // a usable file (see finalizeInterruptedRender in the render route): the
  // old ready video's duration/size must not linger on the now-broken record.
  durationSec?: number | null;
  sizeBytes?: number | null;
}

export async function updateScrollVideo(
  projectId: string,
  videoId: string,
  patch: ScrollVideoPatch
): Promise<ScrollVideo | null> {
  const existing = await readScrollVideo(projectId, videoId);
  if (!existing) return null;
  const updated: ScrollVideo = {
    ...existing,
    ...patch,
    error: patch.error === null ? undefined : (patch.error ?? existing.error),
    renderProgressPercent:
      patch.renderProgressPercent === null ? undefined : (patch.renderProgressPercent ?? existing.renderProgressPercent),
    estimatedSecondsRemaining:
      patch.estimatedSecondsRemaining === null
        ? undefined
        : (patch.estimatedSecondsRemaining ?? existing.estimatedSecondsRemaining),
    durationSec: patch.durationSec === null ? undefined : (patch.durationSec ?? existing.durationSec),
    sizeBytes: patch.sizeBytes === null ? undefined : (patch.sizeBytes ?? existing.sizeBytes),
    updatedAt: new Date().toISOString(),
  };
  await writeScrollVideo(updated);
  return updated;
}

export async function deleteScrollVideo(projectId: string, videoId: string): Promise<void> {
  await fs.rm(metaPath(projectId, videoId), { force: true });
  await fs.rm(projectScrollVideoOutputPath(projectId, videoId), { force: true });
}

// Called when a screenshot selection is deleted, same reasoning as
// removeSelectionFromBoards — a scroll video can't keep referencing a crop
// that no longer exists. Unlike a board (which just drops the one item and
// keeps going), a scroll video with a missing clip can't be meaningfully
// re-rendered as-is, so this marks it "failed" with an explanation rather
// than silently leaving a gap in the sequence — the user re-picks clips
// rather than the app guessing a replacement.
export async function removeSelectionFromScrollVideos(projectId: string, selectionId: string): Promise<void> {
  const videos = await listScrollVideos(projectId);
  for (const video of videos) {
    if (!video.clips.some((c) => c.selectionId === selectionId)) continue;
    await writeScrollVideo({
      ...video,
      clips: video.clips.filter((c) => c.selectionId !== selectionId),
      status: video.status === "ready" ? video.status : "draft",
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function removePageFromScrollVideos(projectId: string, pageSlug: string): Promise<void> {
  const videos = await listScrollVideos(projectId);
  for (const video of videos) {
    if (!video.clips.some((c) => c.pageSlug === pageSlug)) continue;
    await writeScrollVideo({
      ...video,
      clips: video.clips.filter((c) => c.pageSlug !== pageSlug),
      status: video.status === "ready" ? video.status : "draft",
      updatedAt: new Date().toISOString(),
    });
  }
}
