"use client";

import { useState } from "react";
import type { CustomFrame } from "@/types/frame";
import type { BackgroundImage } from "@/types/backgroundImage";

function customFrameSrc(filename: string): string {
  return `/api/media/frames/${filename}`;
}

function backgroundImageSrc(filename: string): string {
  return `/api/media/backgrounds/${filename}`;
}

interface LibraryManagerProps {
  initialCustomFrames: CustomFrame[];
  initialBackgroundImages: BackgroundImage[];
}

/**
 * A consolidated view of the two global, project-independent asset
 * libraries (custom device frames, uploaded backgrounds) — list and delete
 * only. Uploading/editing stays inside the canvas editor, where a frame or
 * background can actually be previewed against real content while setting
 * it up; this page exists so managing what's already there doesn't require
 * opening some arbitrary board first. Deletion here goes through the exact
 * same API routes (and the same usage-aware confirmation + fallback
 * behavior) as deleting from inside the editor — see
 * docs/CUSTOM_FRAMES_PLAN.md.
 */
export function LibraryManager({ initialCustomFrames, initialBackgroundImages }: LibraryManagerProps) {
  const [customFrames, setCustomFrames] = useState<CustomFrame[]>(initialCustomFrames);
  const [backgroundImages, setBackgroundImages] = useState<BackgroundImage[]>(initialBackgroundImages);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDeleteCustomFrame(frame: CustomFrame) {
    let confirmMessage = `Delete "${frame.name}"? This can't be undone.`;
    try {
      const usageRes = await fetch(`/api/frames/${frame.id}/usage`);
      if (usageRes.ok) {
        const usage = await usageRes.json();
        if (usage.items > 0) {
          confirmMessage =
            `"${frame.name}" is used on ${usage.items} item${usage.items === 1 ? "" : "s"} across ${usage.boards} ` +
            `board${usage.boards === 1 ? "" : "s"}. Deleting it will change those items to frameless (no frame). ` +
            `This can't be undone.`;
        }
      }
    } catch {
      // Usage check failed — fall back to the generic message rather than blocking deletion on it.
    }
    if (!window.confirm(confirmMessage)) return;

    setBusyId(frame.id);
    setError(null);
    try {
      const res = await fetch(`/api/frames/${frame.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete that frame.");
      setCustomFrames((prev) => prev.filter((f) => f.id !== frame.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that frame.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteBackgroundImage(image: BackgroundImage) {
    let confirmMessage = `Remove "${image.originalName}" from the library? This can't be undone.`;
    try {
      const usageRes = await fetch(`/api/backgrounds/${image.id}/usage`);
      if (usageRes.ok) {
        const usage = await usageRes.json();
        if (usage.boards > 0) {
          confirmMessage =
            `"${image.originalName}" is used on ${usage.boards} board${usage.boards === 1 ? "" : "s"}. Removing ` +
            `it will change those boards back to the default dark background. This can't be undone.`;
        }
      }
    } catch {
      // Usage check failed — fall back to the generic message rather than blocking deletion on it.
    }
    if (!window.confirm(confirmMessage)) return;

    setBusyId(image.id);
    setError(null);
    try {
      const res = await fetch(`/api/backgrounds/${image.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not remove that image.");
      setBackgroundImages((prev) => prev.filter((img) => img.id !== image.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that image.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="relative mx-auto max-w-5xl space-y-10 px-6 py-12">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-slate-400">
            Every custom frame and background image uploaded from any board, in one place — view and delete only.
            Deleting here works the same as deleting from inside a board&apos;s editor: anything already using it
            falls back to frameless (for a frame) or the default dark background (for a background image), without
            an error.
          </p>
        </header>

        <div className="rounded-lg border border-indigo-800/60 bg-indigo-950/30 px-4 py-3 text-sm text-indigo-200">
          <strong className="font-semibold">To upload a new frame or background</strong>, open any project&apos;s
          board editor (Proceed to Canvas) and upload it there instead — a frame needs its screen corners set while
          you can see it, which only the canvas editor can do.
        </div>

        {error && <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</div>}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Custom frames ({customFrames.length})</h2>
          {customFrames.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-800 px-6 py-8 text-center text-sm text-slate-400">
              No custom frames uploaded yet — upload one from inside any board&apos;s editor.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {customFrames.map((frame) => (
                <li key={frame.id} className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                  <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={customFrameSrc(frame.filename)} alt="" className="max-h-full max-w-full object-contain" />
                  </div>
                  <p className="truncate text-sm font-medium" title={frame.name}>
                    {frame.name}
                  </p>
                  <button
                    onClick={() => handleDeleteCustomFrame(frame)}
                    disabled={busyId === frame.id}
                    className="w-full rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-400 hover:border-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyId === frame.id ? "Deleting…" : "Delete"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Background images ({backgroundImages.length})
          </h2>
          {backgroundImages.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-800 px-6 py-8 text-center text-sm text-slate-400">
              No background images uploaded yet — upload one from inside any board&apos;s editor.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {backgroundImages.map((image) => (
                <li key={image.id} className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                  <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={backgroundImageSrc(image.filename)} alt="" className="h-full w-full object-cover" />
                  </div>
                  <p className="truncate text-sm font-medium" title={image.originalName}>
                    {image.originalName}
                  </p>
                  <button
                    onClick={() => handleDeleteBackgroundImage(image)}
                    disabled={busyId === image.id}
                    className="w-full rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-400 hover:border-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyId === image.id ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
