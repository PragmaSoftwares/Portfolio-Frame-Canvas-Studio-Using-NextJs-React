import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { captureAllDevices, type DeviceCaptureBuffers } from "@/lib/capture/capture";
import { CaptureError, friendlyCaptureMessage } from "@/lib/capture/errors";
import {
  assertSafeId,
  assertSafeSlug,
  projectCaptureDeviceDir,
  projectConsentStatePath,
  projectSessionStatePath,
  type CaptureDevice,
} from "@/lib/storage/paths";
import { readProject, touchProject } from "@/lib/storage/projects";
import { writePageCaptureMeta, readPageCaptureMeta } from "@/lib/storage/captures";
import { registerCapture, unregisterCapture } from "@/lib/capture/cancelRegistry";
import { requestCaptureSlot, currentQueuePosition } from "@/lib/capture/globalQueue";
import type { PageCaptureMeta, DeviceCaptureFiles } from "@/types/capture";
import type { ApprovedPage } from "@/types/project";

export const runtime = "nodejs";

async function saveDevice(
  projectId: string,
  device: CaptureDevice,
  slug: string,
  buffers: DeviceCaptureBuffers
): Promise<DeviceCaptureFiles> {
  const dir = projectCaptureDeviceDir(projectId, device);
  await fs.mkdir(dir, { recursive: true });

  const fullPageFilename = `${slug}-full.png`;
  await fs.writeFile(path.join(dir, fullPageFilename), buffers.fullPage);

  return { fullPage: fullPageFilename };
}

/**
 * The actual capture work, shared by both the immediate path (a slot was
 * free — the HTTP response waits for this) and the queued path (a slot
 * wasn't free — this runs later, in the background, long after the HTTP
 * response for the original request has already gone out). Always writes
 * the terminal PageCaptureMeta itself rather than throwing, so both callers
 * can treat it the same way regardless of whether anything is still
 * listening for an HTTP response by the time it finishes.
 */
async function performCapture(
  projectId: string,
  pageSlug: string,
  page: ApprovedPage,
  baseMeta: PageCaptureMeta,
  signal: AbortSignal
): Promise<{ meta: PageCaptureMeta; httpStatus: number }> {
  try {
    // Load this project's saved Assisted Setup consent state, if it has
    // one — a returning, already-consented visitor typically never sees
    // the cookie/promo banner at all, rather than needing it detected and
    // dismissed on every capture.
    const consentStatePath = projectConsentStatePath(projectId);
    const hasConsentState = await fs
      .access(consentStatePath)
      .then(() => true)
      .catch(() => false);

    // sessionStorage isn't part of storageState — read the separately-saved
    // per-origin snapshot (see assistedSetup.ts) and pull out just this
    // page's origin, if any was captured for it.
    let sessionStorageEntries: Record<string, string> | undefined;
    try {
      const raw = await fs.readFile(projectSessionStatePath(projectId), "utf-8");
      const byOrigin = JSON.parse(raw) as Record<string, Record<string, string>>;
      sessionStorageEntries = byOrigin[new URL(page.url).origin];
    } catch {
      // No saved session state (or unreadable) — fine, just skip it.
    }

    const captured = await captureAllDevices(
      page.url,
      hasConsentState ? consentStatePath : undefined,
      sessionStorageEntries,
      signal
    );

    const [desktop, laptop, tablet, mobile] = await Promise.all([
      saveDevice(projectId, "desktop", pageSlug, captured.desktop),
      saveDevice(projectId, "laptop", pageSlug, captured.laptop),
      saveDevice(projectId, "tablet", pageSlug, captured.tablet),
      saveDevice(projectId, "mobile", pageSlug, captured.mobile),
    ]);

    const readyMeta: PageCaptureMeta = {
      ...baseMeta,
      status: "ready",
      updatedAt: new Date().toISOString(),
      images: { desktop, laptop, tablet, mobile },
      consecutiveFailures: 0,
    };
    await writePageCaptureMeta(readyMeta);
    await touchProject(projectId);
    return { meta: readyMeta, httpStatus: 200 };
  } catch (err) {
    // A cancelled capture (explicit Cancel click) is expected, not an error
    // worth logging or a 502.
    const cancelled = err instanceof CaptureError && err.reason === "cancelled";
    const message = err instanceof CaptureError ? friendlyCaptureMessage(err) : "Capture failed unexpectedly.";
    const finishedMeta: PageCaptureMeta = {
      ...baseMeta,
      status: cancelled ? "cancelled" : "failed",
      error: message,
      updatedAt: new Date().toISOString(),
      // A cancellation is the user stopping it deliberately, not the capture
      // path itself failing — doesn't count towards the streak either way.
      consecutiveFailures: cancelled ? baseMeta.consecutiveFailures ?? 0 : (baseMeta.consecutiveFailures ?? 0) + 1,
    };
    await writePageCaptureMeta(finishedMeta);
    if (!cancelled) console.error("Capture failed:", err);
    return { meta: finishedMeta, httpStatus: cancelled ? 499 : 502 };
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const rawId = record.projectId;
  const rawSlug = record.pageSlug;

  if (typeof rawId !== "string") {
    return NextResponse.json({ error: "A projectId is required." }, { status: 400 });
  }
  if (typeof rawSlug !== "string") {
    return NextResponse.json({ error: "A pageSlug is required." }, { status: 400 });
  }

  let projectId: string;
  let pageSlug: string;
  try {
    projectId = assertSafeId(rawId);
    pageSlug = assertSafeSlug(rawSlug);
  } catch {
    return NextResponse.json({ error: "That project or page id looks invalid." }, { status: 400 });
  }

  const project = await readProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const page = project.approvedPages.find((p) => p.slug === pageSlug);
  if (!page) {
    return NextResponse.json({ error: "Page not found on this project." }, { status: 404 });
  }

  // request.signal does NOT fire on client disconnect for a Node.js-runtime
  // Route Handler in this Next.js version (confirmed live, and by the
  // platform's own docs — only the Edge runtime's ctx exposes a signal at
  // all). This registry is what a separate POST /api/capture/cancel
  // actually reaches into to stop this specific capture — and, checked
  // here before anything else starts, is also what stops two requests for
  // the exact same project+page (e.g. the same project open in two tabs,
  // both clicking Capture on the same page at once) from running
  // concurrently and racing to write the same files.
  const controller = registerCapture(projectId, pageSlug);
  if (!controller) {
    return NextResponse.json(
      { error: "This page is already being captured — check if another tab has it running.", conflict: true },
      { status: 409 }
    );
  }

  const previousFailures = (await readPageCaptureMeta(projectId, pageSlug))?.consecutiveFailures ?? 0;
  const now = new Date().toISOString();
  const baseMeta: PageCaptureMeta = {
    projectId,
    pageSlug,
    pageUrl: page.url,
    status: "capturing",
    createdAt: now,
    updatedAt: now,
    consecutiveFailures: previousFailures,
  };

  // Caps how many captures run at once across the WHOLE server (every
  // project, every tab) — see globalQueue.ts for why this exists separately
  // from the same-page lock above. A capture queued here hasn't started any
  // browser work yet.
  const slot = requestCaptureSlot(projectId, pageSlug);

  if (!slot.immediate) {
    const queuedMeta: PageCaptureMeta = { ...baseMeta, status: "queued" };
    await writePageCaptureMeta(queuedMeta);

    // Deliberately not awaited — this request's HTTP response goes out now,
    // reporting "queued", and the real work happens whenever a slot actually
    // frees, independent of this connection. Blocking the response instead
    // (awaiting slot.ready here) would hold it open for however long the
    // queue takes, which risks the reverse proxy in front of this app timing
    // out the connection long before a real answer is ready — see the
    // deploy notes for the same class of problem with a slow capture itself.
    slot.ready
      .then(async (releaseSlot) => {
        try {
          if (controller.signal.aborted) {
            await writePageCaptureMeta({
              ...baseMeta,
              status: "cancelled",
              error: "Capture was cancelled.",
              updatedAt: new Date().toISOString(),
            });
            return;
          }
          await writePageCaptureMeta({ ...baseMeta, status: "capturing", updatedAt: new Date().toISOString() });
          await performCapture(projectId, pageSlug, page, baseMeta, controller.signal);
        } finally {
          releaseSlot();
          unregisterCapture(projectId, pageSlug);
        }
      })
      .catch((err) => {
        console.error("Background capture failed:", err);
        unregisterCapture(projectId, pageSlug);
      });

    return NextResponse.json({ capture: queuedMeta, queued: true, position: slot.position }, { status: 202 });
  }

  await writePageCaptureMeta(baseMeta);
  const releaseSlot = await slot.ready;
  try {
    const { meta, httpStatus } = await performCapture(projectId, pageSlug, page, baseMeta, controller.signal);
    if (httpStatus !== 200) {
      return NextResponse.json({ error: meta.error, capture: meta }, { status: httpStatus });
    }
    return NextResponse.json({ capture: meta });
  } finally {
    releaseSlot();
    unregisterCapture(projectId, pageSlug);
  }
}

/** Polled by the client while a capture is "queued" or "capturing" — see ProjectWorkspace.tsx. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("projectId");
  const rawSlug = searchParams.get("pageSlug");

  if (typeof rawId !== "string" || typeof rawSlug !== "string") {
    return NextResponse.json({ error: "projectId and pageSlug are required." }, { status: 400 });
  }

  let projectId: string;
  let pageSlug: string;
  try {
    projectId = assertSafeId(rawId);
    pageSlug = assertSafeSlug(rawSlug);
  } catch {
    return NextResponse.json({ error: "That project or page id looks invalid." }, { status: 400 });
  }

  const capture = await readPageCaptureMeta(projectId, pageSlug);
  const position = capture?.status === "queued" ? currentQueuePosition(projectId, pageSlug) : -1;
  return NextResponse.json({ capture, position });
}
