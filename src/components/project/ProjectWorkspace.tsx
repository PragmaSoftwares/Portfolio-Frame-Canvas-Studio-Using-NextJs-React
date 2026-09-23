"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectData, ApprovedPage } from "@/types/project";
import type { PageCaptureMeta } from "@/types/capture";
import type { Board } from "@/types/board";
import { accentFor } from "@/lib/ui/cardAccent";
import { TagPicker } from "@/components/tags/TagPicker";
import { TagPills } from "@/components/tags/TagPills";

const HOME_SLUG = "home";

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
  const [capturingSlug, setCapturingSlugState] = useState<string | null>(null);
  // Slugs waiting their turn — a page whose Capture/Recapture/Retry is
  // clicked while another is already running joins this queue instead of
  // being blocked, same idea as queuing the next episode while one
  // downloads: click as many as you want, they run one at a time in order.
  // Mirrored into refs (source of truth for control flow) alongside the
  // state (which exists purely to re-render) — driven directly from
  // enqueueCapture/runCapture rather than a useEffect, so there's no
  // stale-closure risk from reading state inside a long-running async
  // function, and no "setState during an effect" cascading-render lint
  // error either.
  const [captureQueue, setCaptureQueueState] = useState<string[]>([]);
  const capturingSlugRef = useRef<string | null>(null);
  const captureQueueRef = useRef<string[]>([]);
  // The active capture whose Cancel was clicked but hasn't been confirmed
  // stopped yet — purely cosmetic ("Cancelling…" instead of "Cancel"), so a
  // click doesn't look like it did nothing while the server works its way
  // to its next checkpoint (up to one device's capture time later).
  const [cancellingSlug, setCancellingSlug] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const [newPageUrl, setNewPageUrl] = useState("");
  const [newPageLabel, setNewPageLabel] = useState("");
  const [addingPage, setAddingPage] = useState(false);

  const [boards, setBoards] = useState<Board[]>(initialBoards);
  const [openingCanvas, setOpeningCanvas] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);

  const [assistedSetupAt, setAssistedSetupAt] = useState(project.assistedSetupAt);
  const [assistedSetupActive, setAssistedSetupActive] = useState(false);
  const [assistedSetupBusy, setAssistedSetupBusy] = useState(false);
  const [assistedSetupError, setAssistedSetupError] = useState<string | null>(null);
  const [assistedSetupSaved, setAssistedSetupSaved] = useState(false);

  const [manualUploadEnabled, setManualUploadEnabled] = useState(project.manualUploadEnabled);
  const [manualUploadBusy, setManualUploadBusy] = useState(false);

  const [tags, setTags] = useState<string[]>(project.tags);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [editingTags, setEditingTags] = useState(false);
  const [editTagsValue, setEditTagsValue] = useState<string[]>(project.tags);
  const [savingTags, setSavingTags] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);


  // Recovers the "a window is open, waiting for you" UI state after a page
  // refresh — the session itself lives server-side, independent of this tab.
  useEffect(() => {
    fetch(`/api/projects/${project.id}/assisted-setup/status`)
      .then((res) => res.json())
      .then((data) => setAssistedSetupActive(Boolean(data.status?.active)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/tags")
      .then((res) => res.json())
      .then((data) => setTagSuggestions(Array.isArray(data.tags) ? data.tags : []))
      .catch(() => {});
  }, []);

  async function handleSaveTags() {
    setSavingTags(true);
    setTagsError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: editTagsValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save tags.");
      setTags(data.project.tags);
      setEditingTags(false);
      router.refresh();
    } catch (err) {
      setTagsError(err instanceof Error ? err.message : "Could not save tags.");
    } finally {
      setSavingTags(false);
    }
  }

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

  async function handleToggleManualUpload(checked: boolean) {
    const previous = manualUploadEnabled;
    setManualUploadEnabled(checked); // optimistic — this is a low-stakes toggle
    setManualUploadBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualUploadEnabled: checked }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setManualUploadEnabled(previous); // revert on failure
    } finally {
      setManualUploadBusy(false);
    }
  }

  function setCapturingSlug(slug: string | null) {
    capturingSlugRef.current = slug;
    setCapturingSlugState(slug);
  }

  function setCaptureQueue(next: string[]) {
    captureQueueRef.current = next;
    setCaptureQueueState(next);
  }

  // Pulls the next queued slug and starts it, if nothing's currently
  // running — called directly from enqueueCapture (an idle queue should
  // start immediately) and from runCapture's own finally block (so
  // finishing one capture hands off to the next), rather than a useEffect
  // watching queue/capturingSlug — that would need to call setState from
  // inside the effect body just to pop the queue, which triggers React's
  // "avoid setState directly within an effect" lint rule for good reason
  // (cascading renders). Reading both refs (not the React state) is what
  // makes this safe to call from runCapture's finally after a long series
  // of awaits — the state variables themselves would reflect whatever they
  // were back when runCapture started, not any enqueues that happened while
  // it was in flight.
  function startNextCapture() {
    if (capturingSlugRef.current !== null) return;
    const [next, ...rest] = captureQueueRef.current;
    if (next === undefined) return;
    setCaptureQueue(rest);
    runCapture(next);
  }

  function enqueueCapture(slug: string) {
    if (capturingSlugRef.current === slug || captureQueueRef.current.includes(slug)) return;
    setCaptureQueue([...captureQueueRef.current, slug]);
    startNextCapture();
  }

  // Cancelling the active capture posts to a dedicated endpoint rather than
  // aborting this fetch client-side — see cancelRegistry.ts for why that
  // doesn't work in this runtime. The original /api/capture request just
  // keeps running until the server notices the cancel flag at its next
  // checkpoint and responds with status: "cancelled" through the normal
  // success path below, same as any other way a capture can finish.
  // Cancelling a queued-but-not-started one just removes it from the
  // queue, nothing server-side to reach yet.
  function handleCancelCapture(slug: string) {
    if (capturingSlugRef.current === slug) {
      setCancellingSlug(slug);
      fetch("/api/capture/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, pageSlug: slug }),
      }).catch(() => {});
    } else {
      setCaptureQueue(captureQueueRef.current.filter((s) => s !== slug));
    }
  }

  async function runCapture(slug: string) {
    setCapturingSlug(slug);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, pageSlug: slug }),
      });
      const data = await res.json();
      if (res.status === 409) {
        // The same project open in another tab already has this exact page
        // capturing — nothing happened here, so leave the existing capture
        // state alone (it's still accurate) rather than overwriting it.
        setPageError(data.error ?? "This page is already being captured elsewhere.");
      } else {
        setCaptures((prev) => ({ ...prev, [slug]: data.capture }));
      }
    } catch {
      setCaptures((prev) => ({
        ...prev,
        [slug]: {
          projectId: project.id,
          pageSlug: slug,
          pageUrl: pages.find((p) => p.slug === slug)?.url ?? "",
          status: "failed",
          error: "Could not reach the server.",
          createdAt: prev[slug]?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }));
    } finally {
      setCapturingSlug(null);
      setCancellingSlug((prev) => (prev === slug ? null : prev));
      router.refresh();
      startNextCapture();
    }
  }

  function handleCaptureAllClick() {
    // Each page captures 4 devices sequentially (roughly 30-60s/page based
    // on real runs) — with enough pages this is a genuinely long
    // commitment to trigger by accident, even though any page can now be
    // cancelled individually once it's queued or running.
    const estimateMinutes = Math.max(1, Math.round(pages.length * 0.5));
    const pagesWithUploads = pages.filter((p) =>
      Object.values(captures[p.slug]?.images ?? {}).some((img) => img?.uploaded)
    );
    const uploadWarning =
      pagesWithUploads.length > 0
        ? ` This will also overwrite the screenshot(s) you manually uploaded for ${pagesWithUploads.length === pages.length ? "every page" : `${pagesWithUploads.length} page${pagesWithUploads.length === 1 ? "" : "s"}`} with new automated captures.`
        : "";
    const ok = window.confirm(
      `Capture all ${pages.length} page${pages.length === 1 ? "" : "s"}? Each page takes roughly 30-60 seconds ` +
        `(4 device shots each) — this could take about ${estimateMinutes} minute${estimateMinutes === 1 ? "" : "s"} ` +
        `total. Pages run one at a time and each can be cancelled individually while queued or in progress.${uploadWarning}`
    );
    if (!ok) return;
    for (const page of pages) enqueueCapture(page.slug);
  }

  function handleCaptureClick(slug: string) {
    // Only "Recapture" (an already-ready page, about to be overwritten) is
    // confirmed — a first-time "Capture" or a "Retry" after failure has
    // nothing to lose, so no need to interrupt those with a prompt.
    const capture = captures[slug];
    if (capture?.status === "ready") {
      const label = pages.find((p) => p.slug === slug)?.label ?? "this page";
      const hasUploaded = Object.values(capture.images ?? {}).some((img) => img?.uploaded);
      const message = hasUploaded
        ? `Recapture "${label}"? This will overwrite the screenshot(s) you manually uploaded for this page with new automated captures.`
        : `Recapture "${label}"? This replaces its existing screenshots and takes a little while.`;
      if (!window.confirm(message)) return;
    }
    enqueueCapture(slug);
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

  // Nothing is created or persisted here — /boards/new opens the canvas
  // editor against an in-memory draft board (see draftBoard() in
  // lib/storage/boards.ts). The board only actually gets written to disk
  // on the editor's own first save, so opening the canvas and leaving
  // again without changing anything no longer leaves an empty board
  // behind — it previously created one on every single click.
  function handleProceedToCanvas() {
    if (selectionCount === 0) {
      setBoardError("needs-crop");
      return;
    }
    setBoardError(null);
    setOpeningCanvas(true);
    router.push(`/projects/${project.id}/boards/new`);
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

  async function handleDuplicateBoard(boardId: string) {
    setBoardError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/boards/${boardId}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not duplicate that board.");
      setBoards((prev) => [data.board, ...prev]);
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : "Could not duplicate that board.");
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
          <Link href="/" className="text-xs text-slate-400 hover:text-slate-100">
            ← Back to Dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-slate-400 text-sm">
            <a href={project.mainUrl} target="_blank" rel="noreferrer" className="hover:text-indigo-400">
              {project.mainUrl}
            </a>
            {/* Editing the main URL itself lives on the Home row below (it
                doubles as the "home" approved page) — see onEditUrl there. */}
          </p>

          {editingTags ? (
            <div className="max-w-sm space-y-2 pt-1">
              <TagPicker value={editTagsValue} onChange={setEditTagsValue} suggestions={tagSuggestions} disabled={savingTags} />
              <div className="flex items-center gap-3 text-xs">
                <button
                  onClick={handleSaveTags}
                  disabled={savingTags}
                  className="font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditTagsValue(tags);
                    setEditingTags(false);
                    setTagsError(null);
                  }}
                  className="text-slate-500 hover:text-slate-300"
                >
                  Cancel
                </button>
              </div>
              {tagsError && <p className="text-xs text-red-400">{tagsError}</p>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <TagPills tags={tags} />
              <button
                onClick={() => {
                  setEditTagsValue(tags);
                  setEditingTags(true);
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                Edit tags
              </button>
            </div>
          )}
        </header>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Pages ({pages.length})
            </h2>
            <button
              onClick={handleCaptureAllClick}
              className="bg-gradient-accent glow-accent rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5"
            >
              Capture all pages
            </button>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-200">Assisted setup</p>
                <p className="text-sm text-slate-400">
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
                Some promo popups only appear after scrolling down — scroll through the page there before clicking
                Done, so it has a chance to show up and get dismissed.
              </p>
            )}
            {assistedSetupSaved && !assistedSetupActive && (
              <p className="mt-2 text-xs text-emerald-400">
                Saved — Recapture this project&apos;s pages to see it take effect.
              </p>
            )}
            {assistedSetupError && <p className="mt-2 text-xs text-red-400">{assistedSetupError}</p>}
            <div className="mt-3 border-t border-slate-800 pt-3">
              <label className="flex items-start gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={manualUploadEnabled}
                  onChange={(e) => handleToggleManualUpload(e.target.checked)}
                  disabled={manualUploadBusy}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-500 disabled:opacity-50"
                />
                <span>
                  Assisted setup and automated capture didn&apos;t work for you (security check, a popup that
                  won&apos;t stay dismissed, etc.)? Check this to allow uploading screenshots manually instead.
                </span>
              </label>
              <p className="mt-1.5 pl-6 text-sm text-slate-400">
                A full-page capture from an extension like{" "}
                <a
                  href="https://chromewebstore.google.com/detail/ijidfpoenjmfdabnmchmdoopghmjnjij"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-300 underline underline-offset-2 hover:text-indigo-200"
                >
                  Full Page Screenshot
                </a>{" "}
                works well — it&apos;s used as-is, no cropping to a viewport size. A plain Print Screen /
                &quot;capture visible area&quot; only grabs what&apos;s on screen, not the whole scrollable page.
              </p>
            </div>
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
                isCancelling={cancellingSlug === page.slug}
                queuePosition={captureQueue.indexOf(page.slug)}
                onCapture={() => handleCaptureClick(page.slug)}
                onCancel={() => handleCancelCapture(page.slug)}
                onRemove={page.slug === HOME_SLUG ? undefined : () => handleRemovePage(page.slug)}
                onEditUrl={page.slug === HOME_SLUG ? handleEditHomeUrl : undefined}
                manualUploadEnabled={manualUploadEnabled}
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
                disabled={addingPage}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </div>
            <div className="w-40 space-y-1.5">
              <label className="text-xs text-slate-400">Label (optional)</label>
              <input
                value={newPageLabel}
                onChange={(e) => setNewPageLabel(e.target.value)}
                placeholder="Pricing"
                disabled={addingPage}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={addingPage || newPageUrl.trim().length === 0}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium hover:border-indigo-500 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addingPage ? "Adding…" : "Add page"}
            </button>
          </form>
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
              disabled={openingCanvas}
              className="bg-gradient-accent glow-accent rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {openingCanvas ? "Opening…" : "Proceed to Canvas"}
            </button>
          </div>
          <p className="text-sm text-slate-400">
            Crop the sections you want on the review screen, then arrange them freely on a canvas — drag, resize,
            layer, and export as many boards as you need.
          </p>
          {selectionCount === 0 && (
            <p className="text-sm text-amber-500">
              You haven&apos;t cropped any screenshots yet — review &amp; crop at least one (above) before proceeding
              to canvas.
            </p>
          )}

          {boardError && (
            <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
              {boardError === "needs-crop" ? (
                <>
                  Crop at least one screenshot before proceeding to canvas — see{" "}
                  <Link href={`/projects/${project.id}/review`} className="underline underline-offset-2 hover:text-red-100">
                    Review &amp; crop screenshots
                  </Link>{" "}
                  above.
                </>
              ) : (
                boardError
              )}
            </div>
          )}

          {boards.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-800 px-6 py-8 text-center text-sm text-slate-400">
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
                      onClick={() => handleDuplicateBoard(board.id)}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      Duplicate
                    </button>
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

type DeviceKey = "desktop" | "laptop" | "tablet" | "mobile";
const DEVICE_KEYS: readonly DeviceKey[] = ["desktop", "laptop", "tablet", "mobile"];

function PageRow({
  projectId,
  page,
  capture,
  isCapturing,
  isCancelling,
  queuePosition,
  onCapture,
  onCancel,
  onRemove,
  onEditUrl,
  manualUploadEnabled,
}: {
  projectId: string;
  page: ApprovedPage;
  capture: PageCaptureMeta | undefined;
  isCapturing: boolean;
  /** Cancel was clicked for this (actively-capturing) row, not yet confirmed stopped. */
  isCancelling: boolean;
  /** Index within the capture queue, or -1 when not queued. */
  queuePosition: number;
  onCapture: () => void;
  onCancel: () => void;
  onRemove?: () => void;
  onEditUrl?: (newUrl: string) => Promise<void>;
  manualUploadEnabled: boolean;
}) {
  const isQueued = queuePosition >= 0;
  // Blocks Edit-URL/Remove for a page that's actively capturing or waiting
  // in the queue — every other row stays fully independent, so clicking
  // Capture on one page never blocks clicking Capture on another.
  const rowBusy = isCapturing || isQueued;
  const status = isCapturing ? "capturing" : isQueued ? "queued" : capture?.status ?? "pending";
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
            <a href={page.url} target="_blank" rel="noreferrer" className="hover:text-indigo-300">
              {page.url}
            </a>
            {onEditUrl && (
              <button
                onClick={() => setEditingUrl(true)}
                disabled={rowBusy}
                className="ml-2 text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
              >
                Edit
              </button>
            )}
          </p>
        )}
        {!isCapturing && capture?.images && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            {DEVICE_KEYS.filter((device) => capture.images![device]).map((device) => {
              const deviceImage = capture.images![device]!;
              return (
                <span key={device} className="space-x-1">
                  <span className="text-emerald-400">✓</span>
                  <a
                    href={`/api/media/projects/${projectId}/captures/${device}/${deviceImage.fullPage}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-slate-300"
                  >
                    {device}
                  </a>
                  {deviceImage.uploaded && <span className="text-slate-600">(uploaded)</span>}
                </span>
              );
            })}
          </div>
        )}
        {(status === "failed" || status === "cancelled") && capture?.error && (
          <p className="mt-1 text-xs text-red-400">{capture.error}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <StatusBadge status={status} queuePosition={queuePosition} />
        {rowBusy ? (
          <button
            onClick={onCancel}
            disabled={isCancelling}
            title={isCancelling ? "Stopping — this can take a little while to actually take effect." : undefined}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-red-400 hover:border-red-500 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCancelling ? "Cancelling…" : "Cancel"}
          </button>
        ) : (
          <button
            onClick={onCapture}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium hover:border-slate-500"
          >
            {status === "ready" ? "Recapture" : status === "failed" || status === "cancelled" ? "Retry" : "Capture"}
          </button>
        )}
        {manualUploadEnabled && (
          <Link
            href={`/projects/${projectId}/pages/${page.slug}/upload`}
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            Upload
          </Link>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            disabled={rowBusy}
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

function StatusBadge({ status, queuePosition }: { status: string; queuePosition?: number }) {
  const styles: Record<string, string> = {
    pending: "bg-slate-800 text-slate-400",
    queued: "bg-slate-800 text-slate-300",
    capturing: "bg-indigo-950 text-indigo-300",
    ready: "bg-emerald-950 text-emerald-400",
    failed: "bg-red-950 text-red-400",
    cancelled: "bg-amber-950 text-amber-400",
  };
  const label = status === "queued" && queuePosition !== undefined && queuePosition >= 0 ? `queued #${queuePosition + 1}` : status;
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? styles.pending}`}>
      {label}
    </span>
  );
}
