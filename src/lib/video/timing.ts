import type { ScrollVideoTransition } from "@/types/scrollVideo";

// Upwork's own video upload cap, with a small safety margin — see the
// design discussion this was built from: a video should scroll at a
// natural, comfortable pace by default and ONLY get compressed (sped up
// uniformly) if that natural pace would run past this ceiling. A 1-2 image
// sequence should stay short, not get padded to fill time, and a 100-image
// sequence should speed up rather than produce a multi-minute video.
export const MAX_TOTAL_DURATION_SEC = 59;

// Below this average per-clip scroll time (after any compression), the
// result is flagged as "may scroll too fast to read" rather than silently
// shipping something unreadable.
const MIN_COMFORTABLE_SCROLL_SEC = 1.5;

// Scrolling fully stops before every transition and only resumes once it's
// done — a brief still beat on each side of the effect, long enough for the
// eye to register "this page is done" / "this is the next page" before and
// after it moves. Fixed rather than user-editable, matching the per-clip
// scroll-speed control's own precedent of "one thing to tune, not two" (see
// NEW_CLIP_SPEED_PX_PER_SEC in ScrollVideoEditor.tsx) — these are short
// enough that tuning them wouldn't meaningfully change the feel anyway.
export const HOLD_BEFORE_TRANSITION_SEC = 0.2;
export const HOLD_AFTER_TRANSITION_SEC = 0.2;

export interface TimingClipInput {
  /** This clip's image height once scaled to the output's resolution width. */
  scaledHeight: number;
  /** Transition used moving FROM this clip to the next one — ignored for the last clip. */
  transitionAfter: ScrollVideoTransition;
  transitionDurationSec: number;
  /** This clip's own scroll speed — each clip can have a different pace. */
  scrollSpeedPxPerSec: number;
}

/**
 * How much real time a junction adds to the timeline — zero for "cut" (an
 * instant, un-held join), otherwise the fixed hold on each side plus the
 * transition effect's own duration. Shared by the timing estimate here and
 * the actual filter graph in renderScrollVideo.ts so they can never disagree
 * about how long a junction takes.
 */
export function junctionOverheadSec(transitionAfter: ScrollVideoTransition, transitionDurationSec: number): number {
  if (transitionAfter === "cut") return 0;
  return HOLD_BEFORE_TRANSITION_SEC + transitionDurationSec + HOLD_AFTER_TRANSITION_SEC;
}

export interface ScrollVideoTiming {
  /** Scroll-only duration per clip, in the same order as the input, after any compression. */
  clipScrollDurationsSec: number[];
  totalDurationSec: number;
  /** True if the natural (uncompressed) pace would have exceeded MAX_TOTAL_DURATION_SEC. */
  compressed: boolean;
  /** True if, even after compression, the result likely scrolls too fast to read. */
  warnTooFast: boolean;
}

/**
 * Computes each clip's scroll duration and the overall total, applying the
 * "natural pace by default, only compress to fit the cap" rule agreed on
 * for this feature — never stretches a short sequence to fill time, and
 * compresses a long one just enough to land at the cap, not a hard cut.
 */
export function computeScrollVideoTiming(clips: TimingClipInput[], viewportHeight: number): ScrollVideoTiming {
  if (clips.length === 0) {
    return { clipScrollDurationsSec: [], totalDurationSec: 0, compressed: false, warnTooFast: false };
  }

  // The last clip's own transitionAfter/transitionDurationSec is meaningless
  // (nothing comes after it) — only the first N-1 junctions actually add time.
  const totalJunctionOverheadSec = clips
    .slice(0, -1)
    .reduce((sum, c) => sum + junctionOverheadSec(c.transitionAfter, c.transitionDurationSec), 0);

  // Each clip paces itself — the compression step below still scales every
  // clip by the SAME factor when needed, so a deliberately-slow hero section
  // stays relatively slower than a deliberately-fast footer even once the
  // whole thing gets sped up to fit under the cap.
  const naturalScrollDurations = clips.map(
    (c) => Math.max(0, c.scaledHeight - viewportHeight) / c.scrollSpeedPxPerSec
  );
  const naturalScrollTotal = naturalScrollDurations.reduce((a, b) => a + b, 0);
  // Scrolling now fully stops for every transition (a fixed hold on each
  // side, then the effect itself playing on two otherwise-still frames —
  // see junctionOverheadSec) rather than ffmpeg's `xfade` blending the tail
  // of one clip into the head of the next while both keep moving. That
  // overhead is real ADDED time now, not time shared/overlapped between two
  // adjacent clips the way the old continuous-scroll design worked.
  const naturalTotal = naturalScrollTotal + totalJunctionOverheadSec;

  let clipScrollDurationsSec = naturalScrollDurations;
  let compressed = false;

  if (naturalTotal > MAX_TOTAL_DURATION_SEC && naturalScrollTotal > 0) {
    compressed = true;
    // Solve for a new scroll-total S' such that S' + totalJunctionOverheadSec == MAX_TOTAL_DURATION_SEC.
    // Junction overhead itself is never compressed — holds and transition
    // effects stay at their fixed/configured length regardless of how many
    // screenshots are in the sequence; only the scrolling speeds up.
    const targetScrollTotal = Math.max(0.1, MAX_TOTAL_DURATION_SEC - totalJunctionOverheadSec);
    const factor = targetScrollTotal / naturalScrollTotal;
    clipScrollDurationsSec = naturalScrollDurations.map((d) => d * factor);
  }

  const totalDurationSec = clipScrollDurationsSec.reduce((a, b) => a + b, 0) + totalJunctionOverheadSec;
  const avgClipScrollSec = clipScrollDurationsSec.reduce((a, b) => a + b, 0) / clips.length;
  const warnTooFast = compressed && avgClipScrollSec < MIN_COMFORTABLE_SCROLL_SEC;

  return { clipScrollDurationsSec, totalDurationSec, compressed, warnTooFast };
}
