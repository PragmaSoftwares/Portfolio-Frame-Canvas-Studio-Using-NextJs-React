"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ScrollVideo, ScrollVideoClip, ScrollVideoTransition } from "@/types/scrollVideo";
import type { SelectionWithPage } from "@/lib/storage/review";
import { computeScrollVideoTiming } from "@/lib/video/timing";
import { ImageZoomOverlay, ZoomButton } from "@/components/common/ImageZoomOverlay";

const FPS_OPTIONS = [30, 60, 120, 240];
const SPEED_MIN = 50;
// The slider's own visual range — a number input next to it still accepts
// anything above this for the rare case someone wants to deliberately
// compress a long sequence down to a short target length (e.g. "make this
// ~20s even though it would naturally run longer").
const SPEED_SLIDER_MAX = 1000;
const SPEED_STEP = 50;
// What a newly-added clip starts at — there's no global "default speed"
// control anymore (it was confusing alongside per-clip speeds, since it only
// ever affected clips added after changing it, not ones already in the
// sequence). A plain constant is simpler and just as effective: tune it once
// per clip right after adding it.
const NEW_CLIP_SPEED_PX_PER_SEC = 450;

const TRANSITION_OPTIONS: { value: ScrollVideoTransition; label: string }[] = [
  { value: "cut", label: "Cut (no transition)" },
  { value: "fade", label: "Fade" },
  { value: "slideUp", label: "Slide up" },
  { value: "slideDown", label: "Slide down" },
  { value: "slideLeft", label: "Slide left" },
  { value: "slideRight", label: "Slide right" },
  { value: "wipeUp", label: "Wipe up" },
  { value: "wipeDown", label: "Wipe down" },
  { value: "wipeLeft", label: "Wipe left" },
  { value: "wipeRight", label: "Wipe right" },
  { value: "zoom", label: "Zoom" },
  { value: "flip", label: "Flip" },
];

function selectionImageSrc(projectId: string, filename: string): string {
  return `/api/media/projects/${projectId}/captures/selections/${filename}`;
}

interface ScrollVideoEditorProps {
  projectId: string;
  projectName: string;
  video: ScrollVideo;
  selections: SelectionWithPage[];
  ffmpegVersion?: string;
}

export function ScrollVideoEditor({ projectId, projectName, video, selections, ffmpegVersion }: ScrollVideoEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(video.name);
  const [clips, setClips] = useState<ScrollVideoClip[]>(video.clips);
  const [fps, setFps] = useState(video.fps);
  const [resolutionWidth, setResolutionWidth] = useState(video.resolutionWidth);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selectionSearch, setSelectionSearch] = useState("");
  const [zoomSelectionId, setZoomSelectionId] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState(video.status);
  const [renderInfo, setRenderInfo] = useState<{ durationSec?: number; sizeBytes?: number } | null>(
    video.status === "ready" ? { durationSec: video.durationSec, sizeBytes: video.sizeBytes } : null
  );
  // Set only while a cancelled/stopped render turned out to have produced a
  // usable (if short) partial file — see finalizeInterruptedRender on the
  // render route. Kept separate from renderInfo/"ready" since the video
  // genuinely was cancelled, not successfully finished.
  const [partialInfo, setPartialInfo] = useState<{ durationSec?: number; sizeBytes?: number } | null>(
    video.status === "cancelled" && video.durationSec ? { durationSec: video.durationSec, sizeBytes: video.sizeBytes } : null
  );
  // Reflects whatever the record already says on load — not just errors from
  // an export started in this browser session. Without this, visiting (or
  // refreshing) the page after a failed/cancelled-with-nothing-usable render
  // showed no explanation at all until the user clicked Export again.
  const [exportError, setExportError] = useState<string | null>(
    video.status === "failed" || (video.status === "cancelled" && !video.durationSec)
      ? (video.error ?? "Render failed.")
      : null
  );
  const [exporting, setExporting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<{ percent?: number; etaSec?: number } | null>(null);
  const [deletingPartial, setDeletingPartial] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  // Which row the dragged item is currently over, and whether it would land
  // BEFORE or AFTER that row — not just "which row", since hovering the top
  // half vs bottom half of the same row means two different final
  // positions. Rendered as a thin line above/below that row (see the
  // Sequence list below) so the result is never ambiguous the way a single
  // highlighted-border-on-the-hovered-row was.
  const [dropTarget, setDropTarget] = useState<{ index: number; edge: "before" | "after" } | null>(null);

  // Auto-scrolls the page while dragging a sequence item near the top/bottom
  // of the viewport — without this, moving the last item to the first
  // position meant manually stopping mid-drag, scrolling, and re-grabbing
  // it, since the list has no scroll container of its own (the whole page
  // scrolls). `dragover` fires continuously while a drag is in progress
  // (unlike most pointer events, which need movement over a specific
  // target), so a single window-level listener is enough to track the
  // cursor the whole time, independent of which row it's currently over.
  useEffect(() => {
    if (draggedIndex === null) return;

    const EDGE_SIZE_PX = 120;
    const MAX_SCROLL_PX_PER_FRAME = 18;

    let pointerY = window.innerHeight / 2; // neutral until the first real dragover arrives
    let rafId: number;

    function handleWindowDragOver(e: DragEvent) {
      pointerY = e.clientY;
    }

    function tick() {
      const viewportHeight = window.innerHeight;
      if (pointerY < EDGE_SIZE_PX) {
        const strength = (EDGE_SIZE_PX - pointerY) / EDGE_SIZE_PX;
        window.scrollBy(0, -Math.ceil(strength * MAX_SCROLL_PX_PER_FRAME));
      } else if (pointerY > viewportHeight - EDGE_SIZE_PX) {
        const strength = (pointerY - (viewportHeight - EDGE_SIZE_PX)) / EDGE_SIZE_PX;
        window.scrollBy(0, Math.ceil(strength * MAX_SCROLL_PX_PER_FRAME));
      }
      rafId = requestAnimationFrame(tick);
    }

    window.addEventListener("dragover", handleWindowDragOver);
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("dragover", handleWindowDragOver);
      cancelAnimationFrame(rafId);
    };
  }, [draggedIndex]);

  const selectionById = useMemo(() => {
    const map = new Map<string, SelectionWithPage>();
    for (const s of selections) map.set(s.id, s);
    return map;
  }, [selections]);

  const selectionSearchQuery = selectionSearch.trim().toLowerCase();
  const availableSelections = useMemo(
    () =>
      selections
        .filter((s) => !clips.some((c) => c.selectionId === s.id))
        .filter(
          (s) =>
            selectionSearchQuery.length === 0 ||
            s.label.toLowerCase().includes(selectionSearchQuery) ||
            s.pageLabel.toLowerCase().includes(selectionSearchQuery)
        ),
    [selections, clips, selectionSearchQuery]
  );

  const viewportHeight = Math.round((resolutionWidth * 9) / 16);

  const timing = useMemo(() => {
    const timingClips = clips.map((c) => {
      const sel = selectionById.get(c.selectionId);
      const scaledHeight = sel ? Math.round(sel.height * (resolutionWidth / sel.width)) : 0;
      return {
        scaledHeight,
        transitionAfter: c.transitionAfter,
        transitionDurationSec: c.transitionDurationSec,
        scrollSpeedPxPerSec: c.scrollSpeedPxPerSec,
      };
    });
    return computeScrollVideoTiming(timingClips, viewportHeight);
  }, [clips, selectionById, resolutionWidth, viewportHeight]);

  // Resumes live polling for a render already in progress when this page is
  // loaded or refreshed mid-render — e.g. the user started an export, closed
  // the tab, and came back. Without this, `video.status` (the server's own
  // snapshot at load time) would just sit there unchanged until the next
  // explicit Export click, which would then fail with "already being
  // rendered" instead of reconnecting to the one already running.
  useEffect(() => {
    if (video.status === "queued" || video.status === "rendering" || video.status === "stopping") {
      pollVideoStatus();
    }
    // Deliberately once per mount — video.status is this page's initial
    // server-rendered snapshot, not a value this effect should re-run for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function markDirty() {
    setDirty(true);
  }

  function addClip(selectionId: string, pageSlug: string) {
    // scrollSpeedPxPerSec starts at a plain constant, then is freely editable
    // per clip from there — same pattern as transitionDurationSec defaulting
    // to 0.5s. No global "default speed" control to keep in sync with.
    setClips((prev) => [
      ...prev,
      { selectionId, pageSlug, transitionAfter: "flip", transitionDurationSec: 0.5, scrollSpeedPxPerSec: NEW_CLIP_SPEED_PX_PER_SEC },
    ]);
    markDirty();
  }

  function removeClip(index: number) {
    setClips((prev) => prev.filter((_, i) => i !== index));
    markDirty();
  }

  /**
   * Moves the clip at `fromIndex` to land right before whatever is currently
   * at `insertBeforeIndex` (pass `clips.length` to move it to the very end).
   * Expressed as "insert before index N", not a from/to pair, because a
   * from/to pair that means "swap into this slot" is genuinely ambiguous
   * about whether the moved item ends up before or after whatever used to
   * be there — that ambiguity is exactly what the insertion-line indicator
   * in the Sequence list below resolves, so the move logic has to honor the
   * same "before index N" meaning the indicator promises.
   */
  function reorderClips(fromIndex: number, insertBeforeIndex: number) {
    // Removing fromIndex shifts every later index left by one, so a target
    // position expressed in terms of the ORIGINAL array needs the same
    // adjustment before splicing into the now-shorter one. Both "drop right
    // before itself" and "drop right after itself" collapse to this same
    // adjusted index — i.e. no real move — so both are skipped as a no-op.
    const adjustedIndex = insertBeforeIndex > fromIndex ? insertBeforeIndex - 1 : insertBeforeIndex;
    if (adjustedIndex === fromIndex) {
      return;
    }
    setClips((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(adjustedIndex, 0, moved);
      return next;
    });
    markDirty();
  }

  function updateClip(index: number, patch: Partial<ScrollVideoClip>) {
    setClips((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    markDirty();
  }

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, clips, fps, resolutionWidth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      setDirty(false);
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function pollVideoStatus(): Promise<void> {
    for (;;) {
      // Short enough that a live percentage actually feels live, long enough
      // not to hammer the server while a render is running.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const res = await fetch(`/api/projects/${projectId}/videos/${video.id}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (!data.video) continue;
        const v: ScrollVideo = data.video;
        setVideoStatus(v.status);

        if (v.status === "queued" || v.status === "rendering" || v.status === "stopping") {
          setProgress(
            typeof v.renderProgressPercent === "number"
              ? { percent: v.renderProgressPercent, etaSec: v.estimatedSecondsRemaining }
              : null
          );
          continue;
        }

        setProgress(null);
        if (v.status === "ready") {
          setRenderInfo({ durationSec: v.durationSec, sizeBytes: v.sizeBytes });
          setPartialInfo(null);
          return;
        }
        if (v.status === "failed") {
          setExportError(v.error ?? "Render failed.");
          return;
        }
        if (v.status === "cancelled") {
          // A graceful stop (Cancel button, or the render's own 10-minute
          // timeout) can still leave behind a real, playable file for
          // whatever had already encoded — see finalizeInterruptedRender on
          // the render route. Only worth surfacing as a partial video if
          // there's an actual duration to show for it.
          if (v.durationSec) {
            setPartialInfo({ durationSec: v.durationSec, sizeBytes: v.sizeBytes });
          } else {
            setExportError(v.error ?? "Render was cancelled.");
          }
          return;
        }
        return;
      } catch {
        // Transient network hiccup — keep polling.
      }
    }
  }

  async function handleExport() {
    setExportError(null);
    setPartialInfo(null);
    setProgress(null);
    if (dirty) {
      const saved = await handleSave();
      if (!saved) return;
    }
    // Only covers the initial POST round trip — NOT the render itself. Once
    // the request returns and the job is confirmed queued/rendering, this
    // clears so the Export button's own status-driven label (including the
    // live percentage) takes over instead of being stuck on "Starting…" for
    // the render's whole duration.
    setExporting(true);
    let shouldPoll = false;
    try {
      const res = await fetch(`/api/projects/${projectId}/videos/${video.id}/render`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start export.");
      setVideoStatus(data.video.status);
      if (data.video.status === "ready") {
        setRenderInfo({ durationSec: data.video.durationSec, sizeBytes: data.video.sizeBytes });
      } else if (data.video.status === "failed") {
        setExportError(data.video.error ?? "Render failed.");
      } else {
        shouldPoll = true;
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not start export.");
    } finally {
      setExporting(false);
    }
    if (shouldPoll) {
      await pollVideoStatus();
    }
  }

  async function handleCancel(force: boolean) {
    setCancelling(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/videos/${video.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not cancel the render.");
      if (data.video) setVideoStatus(data.video.status);
      // The poll loop already running from handleExport's own await picks up
      // "stopping" → its eventual "cancelled"/"ready" resolution on its own.
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not cancel the render.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleDeletePartial() {
    setDeletingPartial(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/videos/${video.id}/output`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete the partial video.");
      setPartialInfo(null);
      setVideoStatus(data.video?.status ?? "draft");
      setExportError(null);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not delete the partial video.");
    } finally {
      setDeletingPartial(false);
    }
  }

  function formatDuration(totalSec: number): string {
    const sec = Math.max(0, Math.round(totalSec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/40 px-6 py-4">
        <div>
          <Link href={`/projects/${projectId}`} className="text-xs text-indigo-400 hover:text-indigo-300">
            ← Back to {projectName}
          </Link>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              markDirty();
            }}
            className="mt-1 block rounded border border-transparent bg-transparent px-2 py-1 text-lg font-semibold outline-none hover:border-slate-700 focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-3">
          {ffmpegVersion && <span className="text-xs text-slate-500">ffmpeg {ffmpegVersion}</span>}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
          <button
            onClick={handleExport}
            disabled={
              exporting ||
              videoStatus === "queued" ||
              videoStatus === "rendering" ||
              videoStatus === "stopping" ||
              clips.length === 0
            }
            title={clips.length === 0 ? "Add at least one screenshot first" : undefined}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting
              ? "Starting…"
              : videoStatus === "queued"
                ? "Queued…"
                : videoStatus === "rendering"
                  ? progress?.percent !== undefined
                    ? `Rendering… ${Math.round(progress.percent)}%`
                    : "Rendering…"
                  : videoStatus === "stopping"
                    ? "Stopping…"
                    : videoStatus === "ready"
                      ? "Re-export"
                      : "Export"}
          </button>
          {(videoStatus === "queued" || videoStatus === "rendering") && (
            <button
              onClick={() => handleCancel(false)}
              disabled={cancelling}
              className="rounded-lg border border-red-800 px-3 py-2 text-sm font-medium text-red-300 hover:border-red-600 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Stop
            </button>
          )}
          {videoStatus === "stopping" && (
            <button
              onClick={() => handleCancel(true)}
              disabled={cancelling}
              title="Don't wait for ffmpeg to wrap up — kill it immediately"
              className="rounded-lg border border-red-800 px-3 py-2 text-sm font-medium text-red-300 hover:border-red-600 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelling ? "Stopping…" : "Force stop"}
            </button>
          )}
        </div>
      </header>

      {error && <div className="border-b border-red-800 bg-red-950/50 px-6 py-2 text-sm text-red-300">{error}</div>}
      {exportError && (
        <div className="border-b border-red-800 bg-red-950/50 px-6 py-2 text-sm text-red-300">{exportError}</div>
      )}
      {videoStatus === "rendering" && (
        <div className="flex flex-wrap items-center gap-3 border-b border-indigo-800 bg-indigo-950/30 px-6 py-2 text-sm text-indigo-300">
          <span>
            Rendering…
            {progress?.percent !== undefined ? ` ${Math.round(progress.percent)}%` : ""}
            {progress?.etaSec !== undefined ? ` — about ${formatDuration(progress.etaSec)} remaining` : ""}
          </span>
          {progress?.percent !== undefined && (
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-indigo-900">
              <div
                className="h-full rounded-full bg-indigo-400 transition-[width]"
                style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
              />
            </div>
          )}
        </div>
      )}
      {videoStatus === "stopping" && (
        <div className="border-b border-amber-800 bg-amber-950/30 px-6 py-2 text-sm text-amber-300">
          Stopping — asking ffmpeg to finish writing what it has so far. If this doesn&apos;t resolve in a few
          seconds, use Force stop.
        </div>
      )}
      {videoStatus === "cancelled" && partialInfo && (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-800 bg-amber-950/30 px-6 py-2 text-sm text-amber-300">
          <span>
            Cancelled — a partial video was saved ({partialInfo.durationSec?.toFixed(1)}s,{" "}
            {partialInfo.sizeBytes ? (partialInfo.sizeBytes / (1024 * 1024)).toFixed(1) : "?"}MB)
          </span>
          <a
            href={`/api/media/projects/${projectId}/videos/${video.id}.mp4`}
            download
            className="font-medium text-amber-200 underline underline-offset-2 hover:text-amber-100"
          >
            Download
          </a>
          <button
            onClick={handleDeletePartial}
            disabled={deletingPartial}
            className="font-medium text-red-300 underline underline-offset-2 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deletingPartial ? "Deleting…" : "Delete"}
          </button>
        </div>
      )}
      {videoStatus === "ready" && renderInfo && (
        <div className="flex flex-wrap items-center gap-3 border-b border-emerald-800 bg-emerald-950/30 px-6 py-2 text-sm text-emerald-300">
          <span>
            Ready — {renderInfo.durationSec?.toFixed(1)}s,{" "}
            {renderInfo.sizeBytes ? (renderInfo.sizeBytes / (1024 * 1024)).toFixed(1) : "?"}MB
          </span>
          <a
            href={`/api/media/projects/${projectId}/videos/${video.id}.mp4`}
            download
            className="font-medium text-emerald-200 underline underline-offset-2 hover:text-emerald-100"
          >
            Download video
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_1.3fr_320px]">
        {/* Picker */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Available screenshots ({availableSelections.length})
          </h2>
          {selections.length > 0 && (
            <input
              type="text"
              value={selectionSearch}
              onChange={(e) => setSelectionSearch(e.target.value)}
              placeholder="Search screenshots by name…"
              className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs outline-none placeholder:text-slate-500 focus:border-indigo-500"
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            {availableSelections.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => addClip(s.id, s.pageSlug)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    addClip(s.id, s.pageSlug);
                  }
                }}
                // A <button> here would nest ZoomButton's own <button> inside
                // it — invalid HTML (no <button> inside <button>) that broke
                // hydration. A div with role="button" + explicit key
                // handling keeps this keyboard-accessible without that.
                className="group relative cursor-pointer overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40 text-left hover:border-indigo-500"
              >
                <ZoomButton onClick={() => setZoomSelectionId(s.id)} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selectionImageSrc(projectId, s.filename)} alt="" className="h-24 w-full object-cover object-top" />
                <div className="px-2 py-1.5">
                  <p className="truncate text-[10px] text-slate-500">{s.pageLabel}</p>
                  {/* The crop's own label is what distinguishes it from other crops on
                      the same page — given 2 lines instead of a single-line truncate,
                      which was cutting off exactly that distinguishing part. */}
                  <p className="line-clamp-2 text-xs leading-tight text-slate-300 group-hover:text-slate-100" title={s.label}>
                    {s.label}
                  </p>
                </div>
              </div>
            ))}
            {availableSelections.length === 0 && selections.length === 0 && (
              <p className="col-span-2 text-xs text-slate-500">
                No cropped screenshots yet — crop some from the Review screen first.
              </p>
            )}
            {availableSelections.length === 0 && selections.length > 0 && selectionSearchQuery.length > 0 && (
              <p className="col-span-2 text-xs text-slate-500">No screenshots match your search.</p>
            )}
            {availableSelections.length === 0 && selections.length > 0 && selectionSearchQuery.length === 0 && (
              <p className="col-span-2 text-xs text-slate-500">All available screenshots are already in the sequence.</p>
            )}
          </div>
        </section>

        {/* Sequence */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Sequence ({clips.length})
          </h2>
          {clips.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 px-4 py-10 text-center text-sm text-slate-500">
              Click a screenshot on the left to add it here.
            </div>
          ) : (
            <ul className="space-y-2">
              {(() => {
                const isDragging = draggedIndex !== null;
                return clips.map((clip, index) => {
                const sel = selectionById.get(clip.selectionId);
                const isLast = index === clips.length - 1;
                const isBeingDragged = draggedIndex === index;
                return (
                  <li
                    key={`${clip.selectionId}-${index}`}
                    data-selection-id={clip.selectionId}
                    onDragEnter={(e) => e.preventDefault()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedIndex === null || draggedIndex === index) return;
                      // Which half of this row the cursor is over decides
                      // whether the dragged item would land BEFORE or AFTER
                      // it — the insertion line below renders at whichever
                      // edge this resolves to, so what the user sees always
                      // matches exactly where the drop will actually land.
                      const rect = e.currentTarget.getBoundingClientRect();
                      const isTopHalf = e.clientY < rect.top + rect.height / 2;
                      setDropTarget({ index, edge: isTopHalf ? "before" : "after" });
                    }}
                    onDragLeave={() => setDropTarget((prev) => (prev?.index === index ? null : prev))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedIndex !== null && dropTarget?.index === index) {
                        const insertBeforeIndex = dropTarget.edge === "before" ? index : index + 1;
                        reorderClips(draggedIndex, insertBeforeIndex);
                      }
                      setDraggedIndex(null);
                      setDropTarget(null);
                    }}
                    className={`relative rounded-lg border bg-slate-900/40 transition ${
                      isDragging ? "px-2.5 py-1.5" : "p-2.5"
                    } ${isBeingDragged ? "border-slate-800 opacity-40" : "border-slate-800"}`}
                  >
                    {dropTarget?.index === index && (
                      <div
                        className={`pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-indigo-500 ${
                          dropTarget.edge === "before" ? "-top-1" : "-bottom-1"
                        }`}
                      />
                    )}
                    <div className="flex items-center gap-3">
                      <span
                        draggable
                        onDragStart={() => {
                          // Deferred rather than called directly in the
                          // dragstart handler: setting this synchronously
                          // collapses EVERY row into compact mode immediately,
                          // and for any row other than the very first, that
                          // shrinks everything above it, reflowing the whole
                          // list upward right in the middle of the browser's
                          // own native drag-gesture setup. That position jump
                          // out from under the cursor is a well-known way to
                          // make native HTML5 drag die silently right after
                          // starting — confirmed live: dragstart fired for
                          // every row, but dragover never fired again
                          // afterward for anything below row 0. Letting the
                          // drag gesture fully establish first, then
                          // collapsing the list one tick later, avoids
                          // disrupting it.
                          setTimeout(() => setDraggedIndex(index), 0);
                        }}
                        onDragEnd={() => {
                          setDraggedIndex(null);
                          setDropTarget(null);
                        }}
                        title="Drag to reorder"
                        // A real, generous hit area, not just the character's
                        // own tiny glyph box — confirmed live that clicks
                        // routinely missed the old single-character target
                        // (px-0.5, text-sm, no fixed box) even when aimed right
                        // at it, which meant mousedown/dragstart never fired
                        // at all. The hover background makes the actual
                        // grabbable zone visible instead of guessable.
                        className="flex h-8 w-8 shrink-0 cursor-grab select-none items-center justify-center rounded text-base leading-none text-slate-500 hover:bg-slate-800 hover:text-slate-300 active:cursor-grabbing"
                      >
                        ⠿
                      </span>
                      {/* While ANY item is being dragged, every row collapses to
                          just the handle + title — hiding the thumbnail, speed
                          controls, and transition picker shrinks the whole list
                          enough that a long drag (e.g. last item to first) stays
                          reachable without first scrolling the page by hand.
                          This toggles via CSS (hidden/contents), never by
                          mounting or unmounting nodes — removing elements from
                          the dragged row's own subtree mid-drag is exactly the
                          kind of DOM mutation that makes native HTML5 drag just
                          silently die partway through (confirmed the hard way:
                          an earlier version of this that conditionally rendered
                          two different JSX branches here broke dragging
                          entirely). The always-mounted structure below is the
                          fix — only `className` changes. */}
                      <p className={`min-w-0 flex-1 truncate text-xs text-slate-300 ${isDragging ? "" : "hidden"}`}>
                        {sel ? `${sel.pageLabel} — ${sel.label}` : "Missing screenshot"}
                      </p>
                      <div className={isDragging ? "hidden" : "contents"}>
                        {sel && (
                          <div className="group relative h-12 w-16 shrink-0">
                            <ZoomButton onClick={() => setZoomSelectionId(sel.id)} />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={selectionImageSrc(projectId, sel.filename)}
                              alt=""
                              className="h-full w-full rounded object-cover object-top"
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-xs text-slate-300"
                            title={sel ? `${sel.pageLabel} — ${sel.label}` : undefined}
                          >
                            {sel ? `${sel.pageLabel} — ${sel.label}` : "Missing screenshot"}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-500">
                              {timing.clipScrollDurationsSec[index]?.toFixed(1) ?? "0.0"}s scroll at
                            </span>
                            <input
                              type="number"
                              min={1}
                              value={clip.scrollSpeedPxPerSec}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                if (!Number.isNaN(next) && next > 0) updateClip(index, { scrollSpeedPxPerSec: next });
                              }}
                              title="This clip's own scroll speed"
                              className="w-14 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[11px] outline-none focus:border-indigo-500"
                            />
                            <span className="text-[11px] text-slate-500">px/s</span>
                          </div>
                        </div>
                        <button
                          onClick={() => removeClip(index)}
                          className="shrink-0 text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className={isDragging ? "hidden" : ""}>
                      <input
                        type="range"
                        min={SPEED_MIN}
                        max={SPEED_SLIDER_MAX}
                        step={SPEED_STEP}
                        value={Math.min(clip.scrollSpeedPxPerSec, SPEED_SLIDER_MAX)}
                        onChange={(e) => updateClip(index, { scrollSpeedPxPerSec: Number(e.target.value) })}
                        title="Drag to adjust this clip's scroll speed"
                        className="mt-1.5 w-full"
                      />
                      {!isLast && (
                        <div className="mt-2 flex items-center gap-2 border-t border-slate-800 pt-2">
                          <span className="text-[11px] text-slate-500">Then</span>
                          <select
                            value={clip.transitionAfter}
                            onChange={(e) => updateClip(index, { transitionAfter: e.target.value as ScrollVideoTransition })}
                            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] outline-none focus:border-indigo-500"
                          >
                            {TRANSITION_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          {clip.transitionAfter !== "cut" && (
                            <>
                              <input
                                type="number"
                                min={0.1}
                                max={3}
                                step={0.1}
                                value={clip.transitionDurationSec}
                                onChange={(e) => updateClip(index, { transitionDurationSec: Number(e.target.value) })}
                                className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] outline-none focus:border-indigo-500"
                              />
                              <span className="text-[11px] text-slate-500">sec</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
                });
              })()}
            </ul>
          )}
        </section>

        {/* Settings */}
        <section className="space-y-5">
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Frame rate</h2>
            <select
              value={fps}
              onChange={(e) => {
                setFps(Number(e.target.value));
                markDirty();
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
            >
              {FPS_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f} fps{f === 240 ? " (diminishing returns past 120)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Resolution width</h2>
            <select
              value={resolutionWidth}
              onChange={(e) => {
                setResolutionWidth(Number(e.target.value));
                markDirty();
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
            >
              {[960, 1280, 1600, 1920, 2560].map((w) => (
                <option key={w} value={w}>
                  {w}px wide ({w}×{Math.round((w * 9) / 16)})
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm">
            <p className="text-slate-300">
              Estimated length: <span className="font-semibold text-slate-100">{timing.totalDurationSec.toFixed(1)}s</span>
            </p>
            {timing.compressed && (
              <p className="mt-1.5 text-xs text-amber-400">
                This sequence would naturally run longer than 59s, so scroll speed is being sped up uniformly to fit.
              </p>
            )}
            {timing.warnTooFast && (
              <p className="mt-1.5 text-xs text-red-400">
                That compression makes each screenshot scroll very fast to stay under 59s — consider removing a few
                screenshots.
              </p>
            )}
          </div>
        </section>
      </div>

      {zoomSelectionId &&
        (() => {
          const zoomed = selectionById.get(zoomSelectionId);
          if (!zoomed) return null;
          return (
            <ImageZoomOverlay
              src={selectionImageSrc(projectId, zoomed.filename)}
              alt={`${zoomed.pageLabel} — ${zoomed.label}`}
              onClose={() => setZoomSelectionId(null)}
            />
          );
        })()}
    </div>
  );
}
