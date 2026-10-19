import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  computeScrollVideoTiming,
  HOLD_BEFORE_TRANSITION_SEC,
  HOLD_AFTER_TRANSITION_SEC,
  type TimingClipInput,
} from "./timing";
import type { ScrollVideoTransition } from "@/types/scrollVideo";

export type RenderErrorReason = "cancelled" | "timeout" | "failed";

export class RenderError extends Error {
  reason: RenderErrorReason;

  constructor(message: string, reason: RenderErrorReason = "failed") {
    super(message);
    this.name = "RenderError";
    this.reason = reason;
  }
}

/** Parses ffmpeg's own "HH:MM:SS.ffffff" progress timestamp into seconds. */
function parseFfmpegTime(value: string): number | null {
  const match = value.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const [, h, m, s] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

// How a page scroll video's viewport is shaped relative to its chosen
// resolution width — a plain 16:9 ratio (standard HD/video aspect, e.g.
// 1920 wide -> 1080 tall) — matches the ratio used for the live duration
// estimate in ScrollVideoEditor.tsx (keep these in sync; both derive the
// "how much of each image is visible at once" number the same way).
export function viewportHeightFor(resolutionWidth: number): number {
  return Math.round((resolutionWidth * 9) / 16);
}

// Maps this app's own transition names to ffmpeg's `xfade` filter's own
// vocabulary. "cut" and "flip" never reach this lookup (see the main
// function below) — "cut" is a plain instant join with no effect segment at
// all, and "flip" has no xfade equivalent (xfade has no real 3D rotation),
// so it's built from `perspective` instead (see buildFlipTransition).
const XFADE_NAMES: Partial<Record<ScrollVideoTransition, string>> = {
  fade: "fade",
  slideUp: "slideup",
  slideDown: "slidedown",
  slideLeft: "slideleft",
  slideRight: "slideright",
  wipeUp: "wipeup",
  wipeDown: "wipedown",
  wipeLeft: "wipeleft",
  wipeRight: "wiperight",
  zoom: "zoomin",
};

// A real 3D rotation needs an actual camera projection (focal length), not
// just a linear squeeze toward a center line — the two edges of a rotating
// flat card foreshorten at DIFFERENT rates depending on which one is turning
// toward vs away from the camera, which is what actually reads as "turning"
// rather than "squishing". This ratio (focal length ÷ frame width) and the
// formulas in buildFlipTransition below are ported from a working reference
// implementation (built independently against this project's own
// screenshots, verified frame-by-frame) rather than derived from scratch.
const FLIP_FOCAL_LENGTH_RATIO = 1.354;
// Capped short of a true 90° edge-on turn — AT exactly 90° the perspective
// projection divides by zero and degenerates into a singular (effectively
// zero-width) transform, which `perspective` renders as garbage pixels
// smeared across the frame rather than a clean sliver. Confirmed live.
const FLIP_MAX_ANGLE_RAD = (85 * Math.PI) / 180;
// `perspective` fills the area outside its warped quad by REPLICATING the
// source's own edge pixels, not with a solid color — so without this, the
// black (or whatever-colored) margin around a narrow, turned page would
// actually be smeared copies of whatever's at that page's own edge. Drawing
// a border in this color right before the warp gives `perspective` a solid
// color to replicate instead, producing a clean matte.
const FLIP_BORDER_COLOR = "black";

const n6 = (v: number) => v.toFixed(6);

export interface RenderClipInput {
  /** Absolute filesystem path to this clip's cropped screenshot PNG. */
  filePath: string;
  width: number;
  height: number;
  /** Transition used moving FROM this clip to the next one — ignored on the last clip. */
  transitionAfter: ScrollVideoTransition;
  transitionDurationSec: number;
  /** This clip's own scroll speed — each clip can be paced independently. */
  scrollSpeedPxPerSec: number;
}

/**
 * Builds the handful of ffmpeg CLI args and filter-graph statements that
 * make up one scrolling clip's own segment — every clip gets exactly one of
 * these, regardless of what transitions touch it on either side.
 */
class FilterGraphBuilder {
  readonly args: string[] = [];
  readonly filterParts: string[] = [];
  private nextInputIndex = 0;

  constructor(
    private readonly fps: number,
    private readonly resolutionWidth: number,
    private readonly viewportHeight: number
  ) {}

  /** Registers a `-loop`ed still-image input and returns its ffmpeg input index. */
  private addLoopInput(filePath: string, durationSec: number): number {
    const idx = this.nextInputIndex++;
    this.args.push("-loop", "1", "-framerate", String(this.fps), "-t", Math.max(1 / this.fps, durationSec).toFixed(3), "-i", filePath);
    return idx;
  }

  /** A clip scrolling from the top of the page down to `scaledHeight - viewportHeight` over `durationSec`. */
  addScrollSegment(filePath: string, scaledHeight: number, durationSec: number, label: string): void {
    const idx = this.addLoopInput(filePath, durationSec);
    const scrollExpr =
      scaledHeight > this.viewportHeight
        ? `min(ih-${this.viewportHeight}\\,(ih-${this.viewportHeight})*t/${durationSec.toFixed(3)})`
        : "0";
    this.filterParts.push(
      `[${idx}:v]scale=${this.resolutionWidth}:-2,crop=${this.resolutionWidth}:${this.viewportHeight}:0:${scrollExpr},setsar=1,fps=${this.fps}[${label}]`
    );
  }

  /** A single still frame of a page, held at a fixed scroll offset for `durationSec`. */
  private addStillSegment(filePath: string, yOffset: number, durationSec: number, label: string): void {
    const idx = this.addLoopInput(filePath, durationSec);
    this.filterParts.push(
      `[${idx}:v]scale=${this.resolutionWidth}:-2,crop=${this.resolutionWidth}:${this.viewportHeight}:0:${yOffset},setsar=1,fps=${this.fps}[${label}]`
    );
  }

  /** The fixed-length pause on either side of a transition, holding one page's still frame. */
  addHoldSegment(filePath: string, yOffset: number, durationSec: number, label: string): void {
    this.addStillSegment(filePath, yOffset, durationSec, label);
  }

  /**
   * A plain crossfade-family transition (fade/slide/wipe/zoom) between two
   * now-STILL frames — the outgoing page's last scroll position and the
   * incoming page's first. Unlike the old continuous-scroll design, both
   * sides are frozen, so this is a full-overlap `xfade` (duration spans the
   * WHOLE segment, offset 0) rather than a partial blend stitched into a
   * longer stream — there's no "rest of the clip" on either side to stitch
   * in here anymore; that's handled by the hold segments around it.
   */
  addXfadeTransition(
    transition: ScrollVideoTransition,
    fileA: string,
    offsetA: number,
    fileB: string,
    durationSec: number,
    label: string
  ): void {
    const srcA = `${label}SrcA`;
    const srcB = `${label}SrcB`;
    this.addStillSegment(fileA, offsetA, durationSec, srcA);
    this.addStillSegment(fileB, 0, durationSec, srcB);
    const xfadeName = XFADE_NAMES[transition];
    this.filterParts.push(
      `[${srcA}][${srcB}]xfade=transition=${xfadeName}:duration=${durationSec.toFixed(3)}:offset=0[${label}]`
    );
  }

  /**
   * The "flip" transition: for the first half, the outgoing page's last
   * frame rotates away from 0° to FLIP_MAX_ANGLE_RAD; for the second half,
   * the incoming page's first frame rotates in from -FLIP_MAX_ANGLE_RAD to
   * 0°. Both halves are built the same way (a still frame, a solid border,
   * then `perspective` warping its corners per-frame along an eased angle)
   * and joined with a small `concat` local to this one transition.
   */
  addFlipTransition(fileA: string, offsetA: number, fileB: string, totalDurationSec: number, label: string): void {
    const half = totalDurationSec / 2;
    const focal = this.resolutionWidth * FLIP_FOCAL_LENGTH_RATIO;
    // Eases 0->1 over this half's own frames. `perspective` only exposes a
    // per-instance frame counter (`in`, documented alongside W/H) — it has
    // no raw timestamp variable — so progress is this filter's own frame
    // count divided by how many frames this half actually spans.
    const progress = `min(in/${n6(this.fps * half)},1)`;
    const ease = `(0.5-0.5*cos(PI*${progress}))`;
    const angleOut = `(${n6(FLIP_MAX_ANGLE_RAD)}*${ease})`; // 0 -> +85°, outgoing page turning away
    const angleIn = `(-${n6(FLIP_MAX_ANGLE_RAD)}*(1-${ease}))`; // -85 -> 0, incoming page turning into place

    const quad = (angleExpr: string): string => {
      const s = `sin(${angleExpr})`;
      const c = `cos(${angleExpr})`;
      const kL = `(${n6(focal)}/(${n6(focal)}-W/2*${s}))`;
      const kR = `(${n6(focal)}/(${n6(focal)}+W/2*${s}))`;
      return (
        `x0='W/2-W/2*${c}*${kL}':y0='H/2-H/2*${kL}':` +
        `x1='W/2+W/2*${c}*${kR}':y1='H/2-H/2*${kR}':` +
        `x2='W/2-W/2*${c}*${kL}':y2='H/2+H/2*${kL}':` +
        `x3='W/2+W/2*${c}*${kR}':y3='H/2+H/2*${kR}':` +
        `sense=destination:eval=frame:interpolation=linear`
      );
    };

    const srcOut = `${label}SrcOut`;
    const srcIn = `${label}SrcIn`;
    const halfOut = `${label}Out`;
    const halfIn = `${label}In`;

    this.addStillSegment(fileA, offsetA, half, srcOut);
    this.filterParts.push(
      `[${srcOut}]drawbox=x=0:y=0:w=iw:h=ih:color=${FLIP_BORDER_COLOR}:t=2,perspective=${quad(angleOut)}[${halfOut}]`
    );

    this.addStillSegment(fileB, 0, half, srcIn);
    this.filterParts.push(
      `[${srcIn}]drawbox=x=0:y=0:w=iw:h=ih:color=${FLIP_BORDER_COLOR}:t=2,perspective=${quad(angleIn)}[${halfIn}]`
    );

    this.filterParts.push(`[${halfOut}][${halfIn}]concat=n=2:v=1:a=0[${label}]`);
  }
}

export interface RenderProgress {
  percent: number;
  /** A live extrapolation from this render's own real progress so far — not a pre-render guess (see ScrollVideo.estimatedSecondsRemaining). Undefined until there's enough progress to extrapolate from. */
  estimatedSecondsRemaining?: number;
}

export interface RenderProcessControls {
  /** Kills the ffmpeg process immediately — no graceful stop, no grace period. */
  forceKill: () => void;
}

export interface RenderScrollVideoOptions {
  clips: RenderClipInput[];
  fps: number;
  resolutionWidth: number;
  outputPath: string;
  /** Hard ceiling on how long the ffmpeg process itself is allowed to run — see capture.ts's MAX_CAPTURE_MS for the same reasoning (a runaway render must not be able to hang forever or peg the server indefinitely). Past this, the same graceful-stop-then-hard-kill sequence as a user Cancel runs automatically. */
  timeoutMs?: number;
  /** Aborted to cancel an in-flight render — same idea as captures' cancelRegistry.ts, but doesn't kill ffmpeg outright (see the graceful-stop comment on the main function). */
  signal?: AbortSignal;
  /** Called periodically (throttled) as ffmpeg reports its own encoding progress. */
  onProgress?: (progress: RenderProgress) => void;
  /** Called once, right after the ffmpeg process is spawned, handing the caller a way to kill it immediately — used for a manual "force stop" escalation if the graceful stop below doesn't resolve fast enough for the user. */
  onProcessStart?: (controls: RenderProcessControls) => void;
}

export interface RenderScrollVideoResult {
  durationSec: number;
  sizeBytes: number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — generous for even a long, high-fps, high-res render.

/**
 * Renders a scroll video: each clip pans down through its own screenshot at
 * its own constant speed (all scaled uniformly if the natural combined pace
 * would run past the ~59s ceiling — see lib/video/timing.ts). Scrolling
 * fully stops before every transition and only resumes once it's done — a
 * fixed hold on each side, then the transition effect itself playing on two
 * otherwise-still frames (the outgoing page's last and the incoming page's
 * first) — rather than blending while both pages keep moving, which reads
 * as busy/unclear. "cut" junctions skip the hold-and-effect entirely: the
 * next clip's scroll just starts the instant the previous one's ends.
 * Spawns the system's own `ffmpeg` (see lib/video/ffmpeg.ts for the
 * availability check this assumes already passed) — never ffmpeg.wasm,
 * per the decision to keep rendering server-side and native.
 */
export async function renderScrollVideo(options: RenderScrollVideoOptions): Promise<RenderScrollVideoResult> {
  const { clips, fps, resolutionWidth, outputPath, timeoutMs = DEFAULT_TIMEOUT_MS, signal, onProgress, onProcessStart } = options;
  if (clips.length === 0) {
    throw new RenderError("A scroll video needs at least one screenshot.");
  }

  const viewportHeight = viewportHeightFor(resolutionWidth);

  const scaledHeights = clips.map((c) => Math.round(c.height * (resolutionWidth / c.width)));
  const timingInput: TimingClipInput[] = clips.map((c, i) => ({
    scaledHeight: scaledHeights[i],
    transitionAfter: c.transitionAfter,
    transitionDurationSec: c.transitionDurationSec,
    scrollSpeedPxPerSec: c.scrollSpeedPxPerSec,
  }));
  const timing = computeScrollVideoTiming(timingInput, viewportHeight);

  const graph = new FilterGraphBuilder(fps, resolutionWidth, viewportHeight);
  // The labels making up the final timeline, in order — concatenated once,
  // right at the end, rather than threaded through a running "previous
  // label" the way the old overlapping-xfade chain needed to.
  const timelineLabels: string[] = [];

  clips.forEach((clip, i) => {
    const scrollDuration = Math.max(1 / fps, timing.clipScrollDurationsSec[i]);
    const scrollLabel = `scroll${i}`;
    graph.addScrollSegment(clip.filePath, scaledHeights[i], scrollDuration, scrollLabel);
    timelineLabels.push(scrollLabel);

    const isLastClip = i === clips.length - 1;
    if (isLastClip || clip.transitionAfter === "cut") return;

    const nextClip = clips[i + 1];
    const finalScrollOffset = Math.max(0, scaledHeights[i] - viewportHeight);
    const transitionLabel = `junction${i}`;

    const holdBeforeLabel = `${transitionLabel}HoldBefore`;
    graph.addHoldSegment(clip.filePath, finalScrollOffset, HOLD_BEFORE_TRANSITION_SEC, holdBeforeLabel);
    timelineLabels.push(holdBeforeLabel);

    if (clip.transitionAfter === "flip") {
      graph.addFlipTransition(clip.filePath, finalScrollOffset, nextClip.filePath, clip.transitionDurationSec, transitionLabel);
    } else {
      graph.addXfadeTransition(
        clip.transitionAfter,
        clip.filePath,
        finalScrollOffset,
        nextClip.filePath,
        clip.transitionDurationSec,
        transitionLabel
      );
    }
    timelineLabels.push(transitionLabel);

    const holdAfterLabel = `${transitionLabel}HoldAfter`;
    graph.addHoldSegment(nextClip.filePath, 0, HOLD_AFTER_TRANSITION_SEC, holdAfterLabel);
    timelineLabels.push(holdAfterLabel);
  });

  // A single clip, or one with every junction set to "cut", never needs a
  // concat at all — its lone (or already back-to-back) segment(s) are the
  // final output as-is.
  const finalLabel = timelineLabels.length === 1 ? timelineLabels[0] : "vout";
  if (timelineLabels.length > 1) {
    graph.filterParts.push(`${timelineLabels.map((l) => `[${l}]`).join("")}concat=n=${timelineLabels.length}:v=1:a=0[${finalLabel}]`);
  }

  const args = graph.args;
  const filterComplex = graph.filterParts.join(";");

  args.push(
    "-filter_complex", filterComplex,
    "-map", `[${finalLabel}]`,
    "-r", String(fps),
    "-pix_fmt", "yuv420p",
    // Machine-readable progress (frame=/out_time=/progress=... blocks) on
    // stdout — lets the render be shown as a live percentage + ETA instead
    // of just "rendering…" with no feedback. See the stdout listener below.
    "-progress", "pipe:1",
    "-y",
    outputPath
  );

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const expectedTotalSec = timing.totalDurationSec;
  const startedAt = Date.now();
  let lastProgressReportAt = 0;

  // How long a graceful stop request (below) is given to actually finish
  // before this gives up waiting and kills the process outright.
  const GRACE_PERIOD_MS = 8000;

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    let stdoutBuffer = "";
    let settled = false;
    // Set the moment either a cancel or the overall timeout fires — once
    // set, whatever exit code ffmpeg reports is treated as a stop WE asked
    // for, not a crash, even if that exit happens to be non-zero (which a
    // "q"-requested stop usually is).
    let pendingReason: RenderErrorReason | null = null;
    let hardKillTimer: ReturnType<typeof setTimeout> | null = null;

    const timeoutHandle = setTimeout(() => {
      gracefulStop("timeout");
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeoutHandle);
      if (hardKillTimer) clearTimeout(hardKillTimer);
      if (signal) signal.removeEventListener("abort", onAbort);
    }

    function settleOnce(err: RenderError | null) {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve();
    }

    /** Kills the process outright, right now — no further waiting. */
    function hardKill(reason: RenderErrorReason) {
      pendingReason = reason;
      if (hardKillTimer) {
        clearTimeout(hardKillTimer);
        hardKillTimer = null;
      }
      proc.kill("SIGKILL");
    }

    /**
     * Asks ffmpeg to stop on its own terms by sending it the same "q"
     * keypress a person would type into its terminal — unlike SIGKILL, this
     * lets it flush and finalize the output file's moov atom for whatever
     * it has already encoded, so the result is a real, playable (if short)
     * video instead of a corrupt one. See probeVideoFile() in ffmpeg.ts for
     * how the caller confirms that actually happened. Escalates to a hard
     * kill on its own after GRACE_PERIOD_MS in case ffmpeg doesn't respond
     * (e.g. it's wedged) — the caller can also escalate sooner via the
     * `forceKill` handed to onProcessStart, e.g. if the user clicks a
     * "force stop" button because this is taking too long.
     */
    function gracefulStop(reason: RenderErrorReason) {
      if (pendingReason) return; // already stopping (or stopped) — don't restart the grace timer
      pendingReason = reason;
      try {
        proc.stdin?.write("q\n");
      } catch {
        // stdin may already be closed if the process is on its way out for
        // some other reason — fall through to the hard-kill timer below.
      }
      hardKillTimer = setTimeout(() => {
        proc.kill("SIGKILL");
      }, GRACE_PERIOD_MS);
    }

    function onAbort() {
      gracefulStop("cancelled");
    }
    if (signal) {
      if (signal.aborted) {
        gracefulStop("cancelled");
      } else {
        signal.addEventListener("abort", onAbort);
      }
    }

    onProcessStart?.({ forceKill: () => hardKill("cancelled") });

    if (onProgress && expectedTotalSec > 0) {
      proc.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? ""; // keep any trailing partial line for next chunk
        for (const line of lines) {
          const [key, value] = line.split("=");
          if (key !== "out_time") continue;
          const outTimeSec = parseFfmpegTime(value.trim());
          if (outTimeSec === null) continue;

          // Throttled to at most once a second — ffmpeg can report progress
          // many times a second, far more often than is useful to persist.
          const now = Date.now();
          if (now - lastProgressReportAt < 1000) continue;
          lastProgressReportAt = now;

          const percent = Math.min(100, (outTimeSec / expectedTotalSec) * 100);
          const realElapsedSec = (now - startedAt) / 1000;
          // Needs a little real progress before extrapolating — a percent
          // near 0 would produce a wildly unstable (or infinite) estimate.
          const estimatedSecondsRemaining =
            percent > 2 ? Math.max(0, realElapsedSec / (percent / 100) - realElapsedSec) : undefined;
          onProgress({ percent, estimatedSecondsRemaining });
        }
      });
    }

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      settleOnce(new RenderError(err.message));
    });
    proc.on("close", (code) => {
      if (settled) return;
      if (pendingReason) {
        // Exited because we asked it to (gracefully or by force) — whatever
        // exit code that produced isn't a real failure. The caller decides
        // what happened to the output file (lib/video/ffmpeg.ts's
        // probeVideoFile) rather than this function guessing from the code.
        settleOnce(
          new RenderError(
            pendingReason === "timeout"
              ? "This render took far longer than expected and was stopped automatically."
              : "Render was cancelled.",
            pendingReason
          )
        );
      } else if (code === 0) {
        settleOnce(null);
      } else {
        settleOnce(new RenderError(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });

  const stat = await fs.stat(outputPath);
  return { durationSec: expectedTotalSec, sizeBytes: stat.size };
}
