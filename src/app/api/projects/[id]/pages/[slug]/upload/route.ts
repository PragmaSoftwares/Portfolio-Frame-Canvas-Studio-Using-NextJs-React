import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { assertSafeId, assertSafeSlug, projectCaptureDeviceDir, type CaptureDevice } from "@/lib/storage/paths";
import { readProject, touchProject } from "@/lib/storage/projects";
import { readPageCaptureMeta, writePageCaptureMeta } from "@/lib/storage/captures";
import type { PageCaptureMeta } from "@/types/capture";

export const runtime = "nodejs";

const DEVICES = new Set<CaptureDevice>(["desktop", "laptop", "tablet", "mobile"]);

// Same three formats the media route already knows how to serve.
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * A manual last-resort escape hatch for the automated capture flow and
 * Assisted Setup both failing to produce a clean shot of a page (bot
 * protection, a popup that refuses to stay dismissed, whatever else — see
 * docs/DEV_GUIDE.md). Replaces exactly one device's screenshot with a
 * user-supplied image — e.g. a full-page screenshot taken with a Chrome
 * extension — used as-is, no cropping to a viewport size. Everything
 * downstream (review/crop, canvas, export) reads it the same as any
 * automated capture; only the `uploaded` flag on that device's entry
 * distinguishes it, so Recapture knows to warn before overwriting it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id: rawId, slug: rawSlug } = await params;

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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // This app doesn't impose its own file-size limit — it's happy to accept
    // whatever the browser sends. If reading the body fails, it's most
    // likely something *in front of* this app (a reverse proxy, hosting
    // platform, etc.) rejecting an oversized or malformed request before it
    // ever reached here, or the request was interrupted.
    return NextResponse.json(
      {
        error:
          "Could not read that upload — it may have been rejected by something in front of this app (a reverse " +
          "proxy or hosting platform with its own upload size limit), or the request was interrupted.",
      },
      { status: 400 }
    );
  }

  const device = form.get("device");
  if (typeof device !== "string" || !DEVICES.has(device as CaptureDevice)) {
    return NextResponse.json({ error: "A valid device (desktop, laptop, tablet, or mobile) is required." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  const extension = EXTENSION_BY_MIME[file.type];
  if (!extension) {
    return NextResponse.json({ error: "Please upload a PNG, JPG, or WebP image." }, { status: 400 });
  }

  const existing = await readPageCaptureMeta(projectId, pageSlug);
  const dir = projectCaptureDeviceDir(projectId, device as CaptureDevice);
  await fs.mkdir(dir, { recursive: true });

  // Clear out whatever file previously occupied this device's slot (capture
  // or an earlier upload) — its extension may differ from this upload's, so
  // an old `${slug}-full.png` wouldn't get overwritten by a new `.jpg`.
  const existingFilename = existing?.images?.[device as CaptureDevice]?.fullPage;
  if (existingFilename) {
    await fs.rm(path.join(dir, existingFilename), { force: true });
  }

  const filename = `${pageSlug}-full.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buffer);

  const now = new Date().toISOString();
  const updatedMeta: PageCaptureMeta = {
    projectId,
    pageSlug,
    pageUrl: page.url,
    status: "ready",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    images: {
      ...existing?.images,
      [device]: { fullPage: filename, uploaded: true },
    },
  };
  await writePageCaptureMeta(updatedMeta);
  await touchProject(projectId);

  return NextResponse.json({ capture: updatedMeta });
}
