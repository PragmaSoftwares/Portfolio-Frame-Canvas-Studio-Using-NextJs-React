// "cut" means no transition at all at that junction — the next clip starts
// immediately with a hard cut. Every other value except "flip" maps to an
// ffmpeg `xfade` transition name (see lib/video/renderScrollVideo.ts for the
// mapping) — kept as these friendlier names here rather than ffmpeg's own
// strings so the UI/type layer doesn't need to know ffmpeg's vocabulary.
// "flip" has no `xfade` equivalent (it has no real 3D rotation transition) —
// it's built from a custom perspective-warp filter chain instead, see
// buildFlipJunction in renderScrollVideo.ts.
export type ScrollVideoTransition =
  | "cut"
  | "fade"
  | "slideUp"
  | "slideDown"
  | "slideLeft"
  | "slideRight"
  | "wipeUp"
  | "wipeDown"
  | "wipeLeft"
  | "wipeRight"
  | "zoom"
  | "flip";

/**
 * One screenshot in a scroll video's sequence. `transitionAfter` describes
 * how playback moves from THIS clip to the next one — meaningless on the
 * last clip in the sequence, since there's nothing after it.
 */
export interface ScrollVideoClip {
  selectionId: string;
  pageSlug: string;
  transitionAfter: ScrollVideoTransition;
  transitionDurationSec: number;
  // Defaulted from the video's own scrollSpeedPxPerSec at the moment this
  // clip is added (same pattern as transitionDurationSec defaulting to
  // 0.5s), then freely editable per clip from there — not a toggled
  // "override", just a plain value every clip has.
  scrollSpeedPxPerSec: number;
}

// "queued"/"rendering" mirror the same distinction PageCaptureMeta's
// "queued"/"capturing" make for captures — a render request already
// accepted but waiting on the global capture/render concurrency limit,
// versus one actually running right now. See lib/capture/globalQueue.ts;
// scroll video rendering shares that same queue rather than getting an
// unbounded one of its own.
//
// "stopping" is the brief window after a Cancel click but before ffmpeg has
// actually exited — cancelling asks ffmpeg to wrap up gracefully (so it
// still finalizes a valid, playable file from whatever it already encoded,
// see renderScrollVideo.ts) rather than killing it outright, so there's a
// real gap where the process is still alive on its way out. Resolves on its
// own into "cancelled" (or self-heals the same way a stuck "rendering"
// does, see scrollVideos.ts's healIfStale).
export type ScrollVideoStatus = "draft" | "queued" | "rendering" | "stopping" | "ready" | "failed" | "cancelled";

/** A scrolling portfolio export video — a named, ordered sequence of a project's cropped screenshots, rendered to one MP4. */
export interface ScrollVideo {
  id: string;
  projectId: string;
  name: string;
  clips: ScrollVideoClip[];
  fps: number;
  resolutionWidth: number;
  // The default speed new clips are seeded with when added — not applied
  // retroactively to clips already in the sequence (each clip carries its
  // own scrollSpeedPxPerSec once added; see ScrollVideoClip).
  scrollSpeedPxPerSec: number;
  status: ScrollVideoStatus;
  // Only meaningful while status is "rendering" — ffmpeg reports its own
  // progress as it encodes (see lib/video/renderScrollVideo.ts), compared
  // against this render's own expected total duration. Cleared once the
  // render finishes either way.
  renderProgressPercent?: number;
  // A live extrapolation (real elapsed time so far ÷ percent done × percent
  // remaining) — not a pre-render prediction. How fast this actually goes
  // depends entirely on the server's own hardware, so the only honest
  // estimate is one computed from this render's own real progress once it's
  // already underway, not a guess made before it starts.
  estimatedSecondsRemaining?: number;
  error?: string;
  // Only meaningful once status is "ready" — the actual rendered result,
  // which may differ from scrollSpeedPxPerSec-implied length if the natural
  // duration had to be compressed to fit under the ~59s ceiling (see
  // computeScrollVideoTiming in lib/video/timing.ts).
  durationSec?: number;
  sizeBytes?: number;
  createdAt: string;
  updatedAt: string;
}
