import fs from "node:fs/promises";
import path from "node:path";
import { projectCaptureMetaDir, assertSafeSlug, assertSafeId } from "./paths";
import type { PageCaptureMeta } from "@/types/capture";

export async function writePageCaptureMeta(meta: PageCaptureMeta): Promise<void> {
  const dir = projectCaptureMetaDir(assertSafeId(meta.projectId));
  await fs.mkdir(dir, { recursive: true });
  const filename = `${assertSafeSlug(meta.pageSlug)}.json`;
  await fs.writeFile(path.join(dir, filename), JSON.stringify(meta, null, 2), "utf-8");
}

// How long a "capturing" record is trusted before being treated as
// orphaned — generous compared to the ~30-90s a real 4-device capture
// takes, but short enough to recover promptly. A cancelled or genuinely
// dropped-connection capture already gets marked "cancelled"/"failed"
// immediately by the API route itself (see api/capture/route.ts); this
// timeout only ever fires for the case that can't self-report at all — the
// server *process* being killed/restarted mid-capture, which leaves the
// last-written "capturing" record on disk with nothing left running behind
// it, no error handler ever gets to run, and it would otherwise show as
// perpetually "capturing" forever.
const STALE_CAPTURE_MS = 5 * 60 * 1000;

function isStaleCapture(meta: PageCaptureMeta): boolean {
  return meta.status === "capturing" && Date.now() - new Date(meta.updatedAt).getTime() > STALE_CAPTURE_MS;
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
