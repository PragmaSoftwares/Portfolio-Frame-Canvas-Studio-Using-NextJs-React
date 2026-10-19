"use client";

import { useEffect, useState } from "react";

interface ImageZoomOverlayProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/**
 * A full-screen preview for a single thumbnail — used wherever a picker's
 * thumbnails are too small to tell two similar-looking crops apart before
 * committing to one (dragging onto a canvas, or adding to a scroll video
 * sequence). Closes on Escape, clicking the backdrop, or the close button;
 * clicking the image itself does nothing, so it doesn't fight with the
 * backdrop's close-on-click.
 *
 * These source images are full-page captures — often many times taller than
 * any viewport. Shrinking the whole thing to fit one screen (the original
 * version of this component) made long pages illegible, exactly the problem
 * this exists to solve. Defaults to fit-width instead (readable, only
 * scrolls vertically for the page's actual length), with a toggle to true
 * 100% native size when you need to check an exact pixel/detail — at which
 * point the overlay scrolls in both directions, same as panning around a
 * full-resolution image in any viewer.
 */
export function ImageZoomOverlay({ src, alt, onClose }: ImageZoomOverlayProps) {
  const [actualSize, setActualSize] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black/90" onClick={onClose}>
      <div className="sticky top-0 z-10 flex justify-end gap-2 bg-linear-to-b from-black/80 to-transparent p-4">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActualSize((v) => !v);
          }}
          className="rounded-full bg-slate-900/80 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          {actualSize ? "Fit to window" : "View at 100%"}
        </button>
        <button
          onClick={onClose}
          className="rounded-full bg-slate-900/80 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          ✕ Close
        </button>
      </div>
      <div className={actualSize ? "inline-block px-8 pb-8" : "flex justify-center px-8 pb-8"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onClick={(e) => e.stopPropagation()}
          className={actualSize ? "rounded-lg shadow-2xl" : "h-auto w-full max-w-4xl rounded-lg shadow-2xl"}
        />
      </div>
    </div>
  );
}

/** Small magnifying-glass button, meant to sit absolutely-positioned over a corner of a thumbnail. */
export function ZoomButton({ onClick, title = "Preview full size" }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      draggable={false}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/80 text-slate-200 opacity-0 transition hover:bg-slate-900 group-hover:opacity-100"
    >
      <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5">
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M16 16l-3.8-3.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
