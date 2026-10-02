import fs from "node:fs/promises";
import path from "node:path";
import { projectCaptureMetaDir, assertSafeSlug, assertSafeId } from "./paths";
import type { PageCaptureMeta } from "@/types/capture";
import type { ApprovedPage } from "@/types/project";

export async function writePageCaptureMeta(meta: PageCaptureMeta): Promise<void> {
  const dir = projectCaptureMetaDir(assertSafeId(meta.projectId));
  await fs.mkdir(dir, { recursive: true });
  const filename = `${assertSafeSlug(meta.pageSlug)}.json`;
  await fs.writeFile(path.join(dir, filename), JSON.stringify(meta, null, 2), "utf-8");
}

// How long a "capturing" record is trusted before being treated as
// orphaned — generous compared to capture.ts's own 3-minute hard ceiling on
// a single capture, but short enough to recover promptly. A cancelled or
// genuinely dropped-connection capture already gets marked
// "cancelled"/"failed" immediately by the API route itself (see
// api/capture/route.ts); this timeout only ever fires for the case that
// can't self-report at all — the server *process* being killed/restarted
// mid-capture, which leaves the last-written "capturing" record on disk
// with nothing left running behind it, no error handler ever gets to run,
// and it would otherwise show as perpetually "capturing" forever.
const STALE_CAPTURING_MS = 5 * 60 * 1000;

// A "queued" record (lib/capture/globalQueue.ts) has the same restart
// problem — that queue is in-memory only, so a server restart orphans
// anything still waiting in it exactly like an in-flight "capturing" record.
// Given a longer leash than STALE_CAPTURING_MS, though: with up to 3
// concurrent slots and each capture capped at 3 minutes, a deep-but-genuine
// queue backlog could legitimately wait close to 10+ minutes without
// anything actually being wrong.
const STALE_QUEUED_MS = 15 * 60 * 1000;

function isStaleCapture(meta: PageCaptureMeta): boolean {
  const age = Date.now() - new Date(meta.updatedAt).getTime();
  if (meta.status === "capturing") return age > STALE_CAPTURING_MS;
  if (meta.status === "queued") return age > STALE_QUEUED_MS;
  return false;
}

export async function readPageCaptureMeta(projectId: string, pageSlug: string): Promise<PageCaptureMeta | null> {
  try {
    const dir = projectCaptureMetaDir(assertSafeId(projectId));
    const filename = `${assertSafeSlug(pageSlug)}.json`;
    const raw = await fs.readFile(path.join(dir, filename), "utf-8");
    const meta = JSON.parse(raw) as PageCaptureMeta;
    if (!isStaleCapture(meta)) return meta;

    // Self-heal in place (same pattern as migrateProject/migrateBoard) so
    // this doesn't need re-detecting on every future read, and so the
    // Capture button reliably comes back instead of staying stuck.
    const healed: PageCaptureMeta = {
      ...meta,
      status: "failed",
      error: "This capture was interrupted (e.g. a server restart) and never finished — try Recapture.",
      updatedAt: new Date().toISOString(),
    };
    await writePageCaptureMeta(healed);
    return healed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

// A page counts as "captured" once its capture meta status is "ready" —
// same definition the capture queue UI already uses (ProjectWorkspace.tsx),
// regardless of whether it got there via automated capture (all 4 devices)
// or a manual upload (as few as 1 device) — both end up as the same
// status: "ready" record, and the dashboard doesn't need to tell them apart.
export async function countCapturedPages(projectId: string, approvedPages: ApprovedPage[]): Promise<number> {
  let captured = 0;
  for (const page of approvedPages) {
    const meta = await readPageCaptureMeta(projectId, page.slug);
    if (meta?.status === "ready") captured++;
  }
  return captured;
}
