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

export async function readPageCaptureMeta(projectId: string, pageSlug: string): Promise<PageCaptureMeta | null> {
  try {
    const dir = projectCaptureMetaDir(assertSafeId(projectId));
    const filename = `${assertSafeSlug(pageSlug)}.json`;
    const raw = await fs.readFile(path.join(dir, filename), "utf-8");
    return JSON.parse(raw) as PageCaptureMeta;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
