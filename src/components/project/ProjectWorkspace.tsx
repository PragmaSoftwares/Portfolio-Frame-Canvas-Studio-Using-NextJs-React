"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectData, ApprovedPage } from "@/types/project";
import type { PageCaptureMeta } from "@/types/capture";
import type { Board } from "@/types/board";

const HOME_SLUG = "home";
// Mirrors MAX_ADDITIONAL_PAGES in lib/storage/pages.ts (that module is server-only, imports fs).
const MAX_ADDITIONAL_PAGES = 5;

interface ProjectWorkspaceProps {
  project: ProjectData;
  initialCaptures: Record<string, PageCaptureMeta>;
  initialBoards: Board[];
}

export function ProjectWorkspace({ project, initialCaptures, initialBoards }: ProjectWorkspaceProps) {
  const router = useRouter();
  const [pages, setPages] = useState<ApprovedPage[]>(project.approvedPages);
  const [captures, setCaptures] = useState<Record<string, PageCaptureMeta>>(initialCaptures);
  const [capturingSlug, setCapturingSlug] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [newPageUrl, setNewPageUrl] = useState("");
  const [newPageLabel, setNewPageLabel] = useState("");
  const [addingPage, setAddingPage] = useState(false);

  const [boards, setBoards] = useState<Board[]>(initialBoards);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);

  const additionalCount = pages.length - 1;
  const atPageLimit = additionalCount >= MAX_ADDITIONAL_PAGES;
  const busy = capturingSlug !== null || runningAll;

  async function captureOne(slug: string) {
    setCapturingSlug(slug);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, pageSlug: slug }),
      });
      const data = await res.json();
      setCaptures((prev) => ({ ...prev, [slug]: data.capture }));
    } catch {
      setCaptures((prev) => ({
        ...prev,
        [slug]: {
          projectId: project.id,
          pageSlug: slug,
          pageUrl: pages.find((p) => p.slug === slug)?.url ?? "",
          status: "failed",
          error: "Could not reach the server.",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }));
    } finally {
      setCapturingSlug(null);
      router.refresh();
    }
  }

  async function captureAll() {
    setRunningAll(true);
    for (const page of pages) {
      await captureOne(page.slug);
    }
    setRunningAll(false);
  }

  async function handleAddPage(e: React.FormEvent) {
    e.preventDefault();
    setPageError(null);
    setAddingPage(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newPageUrl, label: newPageLabel || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add that page.");
      setPages((prev) => [...prev, data.page]);
      setNewPageUrl("");
      setNewPageLabel("");
      router.refresh();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Could not add that page.");
    } finally {
      setAddingPage(false);
    }
  }

  async function handleRemovePage(slug: string) {
    if (!window.confirm("Remove this page and its captured screenshots?")) return;
    setPageError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/pages/${slug}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not remove that page.");
      setPages((prev) => prev.filter((p) => p.slug !== slug));
      setCaptures((prev) => {
        const next = { ...prev };
        delete next[slug];
        return next;
      });
      router.refresh();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Could not remove that page.");
    }
  }

  async function handleProceedToCanvas() {
    setBoardError(null);
    setCreatingBoard(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/boards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Board ${boards.length + 1}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create a board.");
      router.push(`/projects/${project.id}/boards/${data.board.id}`);
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : "Could not create a board.");
      setCreatingBoard(false);
    }
  }

  async function handleDeleteBoard(boardId: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    setBoardError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/boards/${boardId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete that board.");
      setBoards((prev) => prev.filter((b) => b.id !== boardId));
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : "Could not delete that board.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-2">
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
            ← Dashboard
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <div className="flex items-center gap-4 text-xs">
              <Link href={`/projects/${project.id}/review`} className="text-indigo-400 hover:text-indigo-300">
                Review screenshots →
              </Link>
            </div>
          </div>
          <p className="text-slate-400 text-sm">
            <a href={project.mainUrl} target="_blank" rel="noreferrer" className="hover:text-indigo-400">
              {project.mainUrl}
            </a>
            {project.category ? ` · ${project.category}` : ""}
          </p>
        </header>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Pages ({pages.length})
            </h2>
            <button
              onClick={captureAll}
              disabled={busy}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runningAll ? "Capturing all…" : "Capture all pages"}
            </button>
          </div>

          {pageError && (
            <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
              {pageError}
            </div>
          )}

          <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
            {pages.map((page) => (
              <PageRow
                key={page.slug}
                projectId={project.id}
                page={page}
                capture={captures[page.slug]}
                isCapturing={capturingSlug === page.slug}
                disabled={busy}
                onCapture={() => captureOne(page.slug)}
                onRemove={page.slug === HOME_SLUG ? undefined : () => handleRemovePage(page.slug)}
              />
            ))}
          </ul>

          <form onSubmit={handleAddPage} className="flex flex-wrap items-end gap-3">
            <div className="min-w-55 flex-1 space-y-1.5">
              <label className="text-xs text-slate-400">Add a page URL</label>
              <input
                value={newPageUrl}
                onChange={(e) => setNewPageUrl(e.target.value)}
                placeholder="https://example.com/pricing"
                disabled={addingPage || atPageLimit}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </div>
            <div className="w-40 space-y-1.5">
              <label className="text-xs text-slate-400">Label (optional)</label>
              <input
                value={newPageLabel}
                onChange={(e) => setNewPageLabel(e.target.value)}
                placeholder="Pricing"
                disabled={addingPage || atPageLimit}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={addingPage || atPageLimit || newPageUrl.trim().length === 0}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addingPage ? "Adding…" : "Add page"}
            </button>
          </form>
          <p className="text-xs text-slate-500">
            {atPageLimit
              ? `You've reached the limit of ${MAX_ADDITIONAL_PAGES} additional pages.`
              : `${MAX_ADDITIONAL_PAGES - additionalCount} of ${MAX_ADDITIONAL_PAGES} additional pages remaining.`}
          </p>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Boards ({boards.length})
            </h2>
            <button
              onClick={handleProceedToCanvas}
              disabled={creatingBoard}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingBoard ? "Creating…" : "Proceed to Canvas"}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Crop the sections you want on the review screen, then arrange them freely on a canvas — drag, resize,
            layer, and export as many boards as you need.
          </p>

          {boardError && (
            <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
              {boardError}
            </div>
          )}

          {boards.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 px-6 py-8 text-center text-sm text-slate-500">
              No boards yet — click &quot;Proceed to Canvas&quot; to create your first one.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
              {boards.map((board) => (
                <li key={board.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/projects/${project.id}/boards/${board.id}`} className="truncate font-medium hover:text-indigo-400">
                      {board.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {board.items.length} item{board.items.length === 1 ? "" : "s"} · {board.canvasWidth}×{board.canvasHeight} ·{" "}
                      {board.background}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    <Link href={`/projects/${project.id}/boards/${board.id}`} className="text-indigo-400 hover:text-indigo-300">
                      Open
                    </Link>
                    <button onClick={() => handleDeleteBoard(board.id, board.name)} className="text-red-400 hover:text-red-300">
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function PageRow({
  projectId,
  page,
  capture,
  isCapturing,
  disabled,
  onCapture,
  onRemove,
}: {
  projectId: string;
  page: ApprovedPage;
  capture: PageCaptureMeta | undefined;
  isCapturing: boolean;
  disabled: boolean;
  onCapture: () => void;
  onRemove?: () => void;
}) {
  const status = isCapturing ? "capturing" : capture?.status ?? "pending";

  return (
    <li className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{page.label}</p>
        <p className="truncate text-xs text-slate-500">{page.url}</p>
        {status === "ready" && capture?.images && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            {/* Older captures (before the "laptop" device existed) won't have every
                key — filter to what's actually present instead of assuming all four,
                so a legacy page shows its 3 devices instead of crashing on the 4th. */}
            {(["desktop", "laptop", "tablet", "mobile"] as const)
              .filter((device) => capture.images![device])
              .map((device) => (
              <span key={device} className="space-x-1">
                <span className="text-emerald-400">✓</span>
                <span>{device}</span>
                <a
                  href={`/api/media/projects/${projectId}/captures/${device}/${capture.images![device].viewport}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-slate-300"
                >
                  viewport
                </a>
                <span>/</span>
                <a
                  href={`/api/media/projects/${projectId}/captures/${device}/${capture.images![device].fullPage}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-slate-300"
                >
                  full-page
                </a>
              </span>
            ))}
          </div>
        )}
        {status === "failed" && capture?.error && <p className="mt-1 text-xs text-red-400">{capture.error}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <StatusBadge status={status} />
        <button
          onClick={onCapture}
          disabled={disabled}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "capturing" ? "Capturing…" : status === "ready" ? "Recapture" : status === "failed" ? "Retry" : "Capture"}
        </button>
        {onRemove && (
          <button
            onClick={onRemove}
            disabled={disabled}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-slate-800 text-slate-400",
    capturing: "bg-indigo-950 text-indigo-300",
    ready: "bg-emerald-950 text-emerald-400",
    failed: "bg-red-950 text-red-400",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  );
}
