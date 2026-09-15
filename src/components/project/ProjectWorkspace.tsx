"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectData, ApprovedPage } from "@/types/project";
import type { PageCaptureMeta } from "@/types/capture";
import type { Board } from "@/types/board";
import { accentFor } from "@/lib/ui/cardAccent";

const HOME_SLUG = "home";
// Mirrors MAX_ADDITIONAL_PAGES in lib/storage/pages.ts (that module is server-only, imports fs).
const MAX_ADDITIONAL_PAGES = 5;

// Deliberately not toLocaleString() — its output depends on the runtime's
// ambient locale/timezone, which differs between the Node server (SSR pass)
// and the browser (hydration), causing a real hydration-mismatch error.
// A manual, always-UTC format is identical in both environments.
function formatAssistedSetupDate(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

interface ProjectWorkspaceProps {
  project: ProjectData;
  initialCaptures: Record<string, PageCaptureMeta>;
  initialBoards: Board[];
  selectionCount: number;
}

export function ProjectWorkspace({ project, initialCaptures, initialBoards, selectionCount }: ProjectWorkspaceProps) {
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

  const [assistedSetupAt, setAssistedSetupAt] = useState(project.assistedSetupAt);
  const [assistedSetupActive, setAssistedSetupActive] = useState(false);
  const [assistedSetupBusy, setAssistedSetupBusy] = useState(false);
  const [assistedSetupError, setAssistedSetupError] = useState<string | null>(null);
  const [assistedSetupSaved, setAssistedSetupSaved] = useState(false);

  const additionalCount = pages.length - 1;
  const atPageLimit = additionalCount >= MAX_ADDITIONAL_PAGES;
  const busy = capturingSlug !== null || runningAll;

  // Recovers the "a window is open, waiting for you" UI state after a page
  // refresh — the session itself lives server-side, independent of this tab.
  useEffect(() => {
    fetch(`/api/projects/${project.id}/assisted-setup/status`)
      .then((res) => res.json())
      .then((data) => setAssistedSetupActive(Boolean(data.status?.active)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStartAssistedSetup() {
    setAssistedSetupBusy(true);
    setAssistedSetupError(null);
    setAssistedSetupSaved(false);
    try {
      const res = await fetch(`/api/projects/${project.id}/assisted-setup/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not open the browser window.");
      setAssistedSetupActive(true);
    } catch (err) {
      setAssistedSetupError(err instanceof Error ? err.message : "Could not open the browser window.");
    } finally {
      setAssistedSetupBusy(false);
    }
  }

  async function handleFinishAssistedSetup() {
    setAssistedSetupBusy(true);
    setAssistedSetupError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/assisted-setup/finish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save what you set up.");
      setAssistedSetupActive(false);
      setAssistedSetupAt(data.savedAt);
      setAssistedSetupSaved(true);
    } catch (err) {
      setAssistedSetupError(err instanceof Error ? err.message : "Could not save what you set up.");
    } finally {
      setAssistedSetupBusy(false);
    }
  }

  async function handleCancelAssistedSetup() {
    setAssistedSetupBusy(true);
    setAssistedSetupError(null);
    try {
      await fetch(`/api/projects/${project.id}/assisted-setup/cancel`, { method: "POST" });
    } finally {
      setAssistedSetupActive(false);
      setAssistedSetupBusy(false);
    }
  }

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

  function handleCaptureAllClick() {
    // Each page captures 4 devices sequentially (roughly 30-60s/page based
    // on real runs) — with enough pages this is a genuinely long,
    // uninterruptible commitment to trigger by accident.
    const estimateMinutes = Math.max(1, Math.round(pages.length * 0.5));
    const ok = window.confirm(
      `Capture all ${pages.length} page${pages.length === 1 ? "" : "s"}? Each page takes roughly 30-60 seconds ` +
        `(4 device shots each) — this could take about ${estimateMinutes} minute${estimateMinutes === 1 ? "" : "s"} ` +
        `total, and can't be cancelled partway through.`
    );
    if (!ok) return;
    captureAll();
  }

  function handleCaptureClick(slug: string) {
    // Only "Recapture" (an already-ready page, about to be overwritten) is
    // confirmed — a first-time "Capture" or a "Retry" after failure has
    // nothing to lose, so no need to interrupt those with a prompt.
    if (captures[slug]?.status === "ready") {
      const label = pages.find((p) => p.slug === slug)?.label ?? "this page";
      if (!window.confirm(`Recapture "${label}"? This replaces its existing screenshots and takes a little while.`)) {
        return;
      }
    }
    captureOne(slug);
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

  async function handleEditHomeUrl(newUrl: string) {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mainUrl: newUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not update the homepage URL.");
    // updateProject() on the server already syncs the "home" approvedPage's
    // own url to match the new mainUrl — mirror that here so the row updates
    // immediately instead of waiting on the router.refresh() below.
    setPages((prev) => prev.map((p) => (p.slug === HOME_SLUG ? { ...p, url: data.project.mainUrl } : p)));
    router.refresh();
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
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-125 w-225 -translate-x-1/2 rounded-full bg-linear-to-br from-indigo-600/15 via-violet-600/8 to-transparent blur-3xl"
      />
      <div className="relative mx-auto max-w-4xl space-y-8 px-6 py-12">
        <header className="space-y-2">
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
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
              onClick={handleCaptureAllClick}
              disabled={busy}
              className="bg-gradient-accent glow-accent rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {runningAll ? "Capturing all…" : "Capture all pages"}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-200">Assisted setup</p>
                <p className="text-xs text-slate-500">
                  Seeing cookie banners, promo popups, or a security check in your captures? Open this project in
                  a real browser window, click through them yourself once — future captures will skip them too.
                </p>
                {assistedSetupAt && !assistedSetupActive && (
                  <p className="mt-1 text-xs text-slate-600">Last set up {formatAssistedSetupDate(assistedSetupAt)}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {assistedSetupActive ? (
                  <>
                    <button
                      onClick={handleFinishAssistedSetup}
                      disabled={assistedSetupBusy}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {assistedSetupBusy ? "Saving…" : "Done — Save"}
                    </button>
                    <button
                      onClick={handleCancelAssistedSetup}
                      disabled={assistedSetupBusy}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-500 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleStartAssistedSetup}
                    disabled={assistedSetupBusy}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium hover:border-indigo-500 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {assistedSetupBusy ? "Opening…" : "Open Assisted setup"}
                  </button>
                )}
              </div>
            </div>
            {assistedSetupActive && (
              <p className="mt-2 text-xs text-amber-400/80">
                A browser window has opened on this machine — click through any banners there, then come back and
                click &quot;Done — Save&quot;. Closing the window without clicking Done discards the session.
              </p>
            )}
            {assistedSetupSaved && !assistedSetupActive && (
              <p className="mt-2 text-xs text-emerald-400">
                Saved — Recapture this project&apos;s pages to see it take effect.
              </p>
            )}
            {assistedSetupError && <p className="mt-2 text-xs text-red-400">{assistedSetupError}</p>}
          </div>

          {pageError && (
            <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
              {pageError}
            </div>
          )}

          <ul className="space-y-3">
            {pages.map((page) => (
              <PageRow
                key={page.slug}
                projectId={project.id}
                page={page}
                capture={captures[page.slug]}
                isCapturing={capturingSlug === page.slug}
                disabled={busy}
                onCapture={() => handleCaptureClick(page.slug)}
                onRemove={page.slug === HOME_SLUG ? undefined : () => handleRemovePage(page.slug)}
                onEditUrl={page.slug === HOME_SLUG ? handleEditHomeUrl : undefined}
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
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium hover:border-indigo-500 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
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

        <section>
          <div
            className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-4 ${
              selectionCount === 0 ? "border-amber-700/60 bg-amber-950/20" : "border-slate-800 bg-slate-900/40"
            }`}
          >
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                {selectionCount === 0 ? "Next step: review & crop your captures" : "Review & crop screenshots"}
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {selectionCount === 0
                  ? "Capture a page above, then crop the sections you want to use — a board has nothing to work with until you do this."
                  : `${selectionCount} section${selectionCount === 1 ? "" : "s"} cropped and ready to drag onto a canvas.`}
              </p>
            </div>
            <Link
              href={`/projects/${project.id}/review`}
              className="bg-gradient-accent glow-accent shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5"
            >
              Review &amp; crop screenshots →
            </Link>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Boards ({boards.length})
            </h2>
            <button
              onClick={handleProceedToCanvas}
              disabled={creatingBoard}
              className="bg-gradient-accent glow-accent rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {creatingBoard ? "Creating…" : "Proceed to Canvas"}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Crop the sections you want on the review screen, then arrange them freely on a canvas — drag, resize,
            layer, and export as many boards as you need.
          </p>
          {selectionCount === 0 && (
            <p className="text-xs text-amber-500">
              You haven&apos;t cropped any screenshots yet — a new board will start empty. Review &amp; crop first
              (above), or just make a note to come back to this one.
            </p>
          )}

          {boardError && (
            <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
              {boardError}
            </div>
          )}

          {boards.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-800 px-6 py-8 text-center text-sm text-slate-500">
              No boards yet — click &quot;Proceed to Canvas&quot; to create your first one.
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {boards.map((board) => (
                <li
                  key={board.id}
                  className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition hover:-translate-y-0.5 hover:border-slate-700 hover:shadow-xl hover:shadow-indigo-950/40"
                >
                  <div className={`absolute inset-x-0 top-0 h-1 bg-linear-to-r ${accentFor(board.id)}`} />

                  <div className="min-w-0">
                    <Link
                      href={`/projects/${project.id}/boards/${board.id}`}
                      className="block truncate text-base font-semibold text-slate-100 hover:text-indigo-300"
                    >
                      {board.name}
                    </Link>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {board.items.length} item{board.items.length === 1 ? "" : "s"} · {board.canvasWidth}×{board.canvasHeight} ·{" "}
                      {board.background}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center gap-4 border-t border-slate-800/80 pt-3 text-xs">
                    <Link href={`/projects/${project.id}/boards/${board.id}`} className="text-indigo-400 hover:text-indigo-300">
                      Open
                    </Link>
                    <button
                      onClick={() => handleDeleteBoard(board.id, board.name)}
                      className="ml-auto text-red-400/90 hover:text-red-300"
                    >
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
  onEditUrl,
}: {
  projectId: string;
  page: ApprovedPage;
  capture: PageCaptureMeta | undefined;
  isCapturing: boolean;
  disabled: boolean;
  onCapture: () => void;
  onRemove?: () => void;
  onEditUrl?: (newUrl: string) => Promise<void>;
}) {
  const status = isCapturing ? "capturing" : capture?.status ?? "pending";
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(page.url);
  const [savingUrl, setSavingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  async function handleSaveUrl() {
    if (!onEditUrl) return;
    setSavingUrl(true);
    setUrlError(null);
    try {
      await onEditUrl(urlDraft.trim());
      setEditingUrl(false);
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : "Could not update the URL.");
    } finally {
      setSavingUrl(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/40 px-5 py-4 transition hover:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{page.label}</p>
        {editingUrl ? (
          <div className="mt-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                disabled={savingUrl}
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500 disabled:opacity-50"
              />
              <button
                onClick={handleSaveUrl}
                disabled={savingUrl || urlDraft.trim().length === 0}
                className="rounded-lg bg-indigo-500 px-2.5 py-1.5 text-xs font-medium hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingUrl ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => {
                  setEditingUrl(false);
                  setUrlDraft(page.url);
                  setUrlError(null);
                }}
                disabled={savingUrl}
                className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {urlError && <p className="text-xs text-red-400">{urlError}</p>}
            <p className="text-[11px] text-slate-500">
              Existing captures and crops for this page won&apos;t update on their own — Recapture afterward.
            </p>
          </div>
        ) : (
          <p className="truncate text-xs text-slate-500">
            {page.url}
            {onEditUrl && (
              <button
                onClick={() => setEditingUrl(true)}
                disabled={disabled}
                className="ml-2 text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
              >
                Edit
              </button>
            )}
          </p>
        )}
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
        {!onRemove && onEditUrl && (
          <span className="text-xs text-slate-600" title="Every project needs exactly one homepage — edit its URL above instead of removing it.">
            Main page
          </span>
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
