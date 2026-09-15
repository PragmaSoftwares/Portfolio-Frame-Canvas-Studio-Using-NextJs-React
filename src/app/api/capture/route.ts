import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { captureAllDevices, type DeviceCaptureBuffers } from "@/lib/capture/capture";
import { CaptureError, friendlyCaptureMessage } from "@/lib/capture/errors";
import { assertSafeId, assertSafeSlug, projectCaptureDeviceDir, type CaptureDevice } from "@/lib/storage/paths";
import { readProject, touchProject } from "@/lib/storage/projects";
import { writePageCaptureMeta } from "@/lib/storage/captures";
import type { PageCaptureMeta, DeviceCaptureFiles } from "@/types/capture";

export const runtime = "nodejs";

async function saveDevice(
  projectId: string,
  device: CaptureDevice,
  slug: string,
  buffers: DeviceCaptureBuffers
): Promise<DeviceCaptureFiles> {
  const dir = projectCaptureDeviceDir(projectId, device);
  await fs.mkdir(dir, { recursive: true });

  const viewportFilename = `${slug}.png`;
  const fullPageFilename = `${slug}-full.png`;
  await fs.writeFile(path.join(dir, viewportFilename), buffers.viewport);
  await fs.writeFile(path.join(dir, fullPageFilename), buffers.fullPage);

  return { viewport: viewportFilename, fullPage: fullPageFilename };
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

  const now = new Date().toISOString();
  const baseMeta: PageCaptureMeta = {
    projectId,
    pageSlug,
    pageUrl: page.url,
    status: "capturing",
    createdAt: now,
    updatedAt: now,
  };
  await writePageCaptureMeta(baseMeta);

  try {
    const captured = await captureAllDevices(page.url);

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
    };
    await writePageCaptureMeta(readyMeta);
    await touchProject(projectId);

    return NextResponse.json({ capture: readyMeta });
  } catch (err) {
    const message = err instanceof CaptureError ? friendlyCaptureMessage(err) : "Capture failed unexpectedly.";
    const failedMeta: PageCaptureMeta = {
      ...baseMeta,
      status: "failed",
      error: message,
      updatedAt: new Date().toISOString(),
    };
    await writePageCaptureMeta(failedMeta);
    console.error("Capture failed:", err);
    return NextResponse.json({ error: message, capture: failedMeta }, { status: 502 });
  }
}
