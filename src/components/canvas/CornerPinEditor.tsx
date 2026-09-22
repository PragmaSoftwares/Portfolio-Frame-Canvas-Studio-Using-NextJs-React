"use client";

import { useEffect, useRef, useState } from "react";
import type { FrameScreenQuad, FrameCorner } from "@/types/frame";

type CornerKey = keyof FrameScreenQuad;
const CORNER_ORDER: CornerKey[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];

const MAX_DISPLAY_WIDTH = 480;
// A portrait-oriented frame (e.g. a phone mockup) shouldn't get taller than
// this — capped so the modal (heading, name field, Save/Cancel) never gets
// pushed off-screen regardless of the uploaded image's own aspect ratio.
const MAX_DISPLAY_HEIGHT = 420;
// Pixels scanned for the default-guess alpha bounding box — downscaled for
// speed, since only the resulting percentages matter, not source resolution.
const MAX_SCAN_DIM = 600;

function centeredDefaultQuad(): FrameScreenQuad {
  return {
    topLeft: { xPct: 0.1, yPct: 0.1 },
    topRight: { xPct: 0.9, yPct: 0.1 },
    bottomRight: { xPct: 0.9, yPct: 0.9 },
    bottomLeft: { xPct: 0.1, yPct: 0.9 },
  };
}

/**
 * A cheap, one-time default-guess for the corner-pin tool — finds the
 * screen cutout as the bounding box of transparent pixels that are fully
 * *enclosed* by opaque ones, scaled down for scan speed. Not real corner
 * detection (see docs/CUSTOM_FRAMES_PLAN.md's "explicitly deferred" list)
 * — just saves the user from starting every handle stacked in one corner.
 *
 * Deliberately not just "the bounding box of every transparent pixel":
 * most real device mockups sit on a transparent canvas themselves (a
 * rounded/angled body, not a plain rectangle), so the padding *outside*
 * the device is transparent too, right up to the image's own edges. A
 * naive bounding box merges that outer padding with the actual screen
 * hole and ends up spanning almost the whole image. Flood-filling inward
 * from the 4 edges first marks everything reachable from the border as
 * "outside" — the true screen hole, surrounded by the opaque bezel, is
 * never reachable from the border, so what's left after that is exactly
 * the enclosed hole(s).
 */
function guessQuadFromTransparency(img: HTMLImageElement): { quad: FrameScreenQuad; foundHole: boolean } {
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, MAX_SCAN_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { quad: centeredDefaultQuad(), foundHole: false };
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const ALPHA_THRESHOLD = 250; // near-transparent counts as "hole"
    const isTransparent = (x: number, y: number) => data[(y * w + x) * 4 + 3] < ALPHA_THRESHOLD;

    // Flood-fill from every border cell, over transparent pixels only —
    // marks the outer padding (and anything connected to it) as "outside".
    const outside = new Uint8Array(w * h);
    const queue: number[] = [];
    for (let x = 0; x < w; x += 1) {
      if (isTransparent(x, 0)) queue.push(x, 0);
      if (isTransparent(x, h - 1)) queue.push(x, h - 1);
    }
    for (let y = 0; y < h; y += 1) {
      if (isTransparent(0, y)) queue.push(0, y);
      if (isTransparent(w - 1, y)) queue.push(w - 1, y);
    }
    let qi = 0;
    while (qi < queue.length) {
      const x = queue[qi];
      const y = queue[qi + 1];
      qi += 2;
      const idx = y * w + x;
      if (outside[idx]) continue;
      outside[idx] = 1;
      if (x > 0 && !outside[idx - 1] && isTransparent(x - 1, y)) queue.push(x - 1, y);
      if (x < w - 1 && !outside[idx + 1] && isTransparent(x + 1, y)) queue.push(x + 1, y);
      if (y > 0 && !outside[idx - w] && isTransparent(x, y - 1)) queue.push(x, y - 1);
      if (y < h - 1 && !outside[idx + w] && isTransparent(x, y + 1)) queue.push(x, y + 1);
    }

    // What's left: transparent, but never reached from the border — an
    // enclosed hole. Take its bounding box as the guessed screen area.
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    let found = false;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = y * w + x;
        if (!outside[idx] && isTransparent(x, y)) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return { quad: centeredDefaultQuad(), foundHole: false };
    return {
      quad: {
        topLeft: { xPct: minX / w, yPct: minY / h },
        topRight: { xPct: maxX / w, yPct: minY / h },
        bottomRight: { xPct: maxX / w, yPct: maxY / h },
        bottomLeft: { xPct: minX / w, yPct: maxY / h },
      },
      foundHole: true,
    };
  } catch {
    return { quad: centeredDefaultQuad(), foundHole: false };
  }
}

interface CornerPinEditorProps {
  // The name shown/edited in the "Frame name" field, and what a create-flow
  // caller defaults it to (e.g. the uploaded file's own name minus
  // extension) — computed by the caller rather than passed as a raw `File`,
  // since an edit flow (correcting an already-saved frame) has a name to
  // start from but no File object at all.
  initialName: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  // When correcting an already-saved frame's corners (as opposed to a
  // brand-new upload), the caller already knows the current quad — skips
  // the one-time alpha-transparency guess entirely and starts the handles
  // there instead.
  initialQuad?: FrameScreenQuad;
  // Built-in frames don't have an editable name (their identity is the
  // fixed variant, not a stored name) — hides the "Frame name" field
  // entirely rather than showing a name nothing will do anything with.
  showNameField?: boolean;
  title?: string;
  description?: string;
  saveLabel?: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (quad: FrameScreenQuad, name: string) => void;
}

/**
 * A corner-pin tool: drag 4 independent handles over a frame image to mark
 * where a screenshot should go, for frames that aren't a plain flat
 * rectangle (e.g. a 3D-angle laptop mockup). Used both for a brand-new
 * upload (starting corners guessed from the image's own alpha transparency)
 * and to correct an already-saved frame's corners (starting from its
 * current quad, custom or built-in) — see docs/CUSTOM_FRAMES_PLAN.md.
 * Deliberately manual either way, no auto-detection.
 */
export function CornerPinEditor({
  initialName,
  imageUrl,
  imageWidth,
  imageHeight,
  initialQuad,
  showNameField = true,
  title = "Set the screen corners",
  description = "Drag each of the 4 handles onto the corners of this frame's screen area. A screenshot placed in this frame later will be warped to exactly fit whatever shape you draw here.",
  saveLabel = "Save frame",
  busy,
  error,
  onCancel,
  onSave,
}: CornerPinEditorProps) {
  const [name, setName] = useState(initialName);
  const [quad, setQuad] = useState<FrameScreenQuad>(() => initialQuad ?? centeredDefaultQuad());
  // Whether the alpha scan found a real enclosed transparent hole to seed
  // the handles from — false either before it's run, or if the uploaded
  // image turned out to have no usable transparency at all, which is worth
  // telling the user about directly rather than leaving them to wonder why
  // the handles started in a generic centered box. Left true (no warning)
  // when correcting an already-saved frame's corners — its transparency
  // already rendered fine before, and no scan runs in that case.
  const [foundTransparency, setFoundTransparency] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingCorner = useRef<CornerKey | null>(null);

  const scale = Math.min(MAX_DISPLAY_WIDTH / imageWidth, MAX_DISPLAY_HEIGHT / imageHeight, 1);
  const displayWidth = Math.round(imageWidth * scale);
  const displayHeight = Math.round(imageHeight * scale);

  useEffect(() => {
    if (initialQuad) return; // already know the corners — nothing to guess
    const img = new Image();
    img.onload = () => {
      const result = guessQuadFromTransparency(img);
      setQuad(result.quad);
      setFoundTransparency(result.foundHole);
    };
    img.src = imageUrl;
  }, [imageUrl, initialQuad]);

  function updateCornerFromEvent(corner: CornerKey, clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const yPct = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    setQuad((prev) => ({ ...prev, [corner]: { xPct, yPct } }));
  }

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (!draggingCorner.current) return;
      updateCornerFromEvent(draggingCorner.current, e.clientX, e.clientY);
    }
    function onPointerUp() {
      draggingCorner.current = null;
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const points = CORNER_ORDER.map((key) => quad[key]);
  const polygonPoints = points.map((p) => `${p.xPct * 100},${p.yPct * 100}`).join(" ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6">
      <div className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>

        {!foundTransparency && (
          <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
            This image doesn&apos;t seem to have a transparent screen area — the checkerboard pattern below should
            show through where the screen goes. Without real transparency there, the frame&apos;s own artwork will
            just sit on top and completely cover any screenshot placed here. Re-export it from your design tool with
            that area cut out (alpha transparency), or drag the handles onto the intended screen position anyway —
            it just won&apos;t look right until the image itself has a real cutout.
          </div>
        )}

        <div
          ref={containerRef}
          className="relative mx-auto select-none overflow-hidden rounded-lg border border-slate-700 bg-[repeating-conic-gradient(#334155_0%_25%,#1e293b_0%_50%)] bg-[length:20px_20px]"
          style={{ width: displayWidth, height: displayHeight }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points={polygonPoints} fill="rgba(99,102,241,0.25)" stroke="rgb(129,140,248)" strokeWidth={0.5} />
          </svg>
          {CORNER_ORDER.map((key) => {
            const corner: FrameCorner = quad[key];
            return (
              <div
                key={key}
                onPointerDown={(e) => {
                  e.preventDefault();
                  draggingCorner.current = key;
                }}
                title={key}
                className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-white bg-indigo-500 shadow active:cursor-grabbing"
                style={{ left: `${corner.xPct * 100}%`, top: `${corner.yPct * 100}%` }}
              />
            );
          })}
        </div>

        {showNameField && (
          <div className="space-y-1.5">
            <label htmlFor="custom-frame-name" className="text-xs font-medium text-slate-300">
              Frame name
            </label>
            <input
              id="custom-frame-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
            />
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(quad, name.trim() || "Custom frame")}
            disabled={busy || (showNameField && name.trim().length === 0)}
            className="bg-gradient-accent glow-accent rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Saving…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
