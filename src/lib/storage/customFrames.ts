import fs from "node:fs/promises";
import path from "node:path";
import { CUSTOM_FRAMES_ROOT, customFramesIndexPath, generateCustomFrameId, assertSafeId } from "./paths";
import type { CustomFrame, FrameScreenQuad } from "@/types/frame";

interface CustomFramesIndex {
  frames: CustomFrame[];
}

async function readIndex(): Promise<CustomFramesIndex> {
  try {
    const raw = await fs.readFile(customFramesIndexPath(), "utf-8");
    return { frames: [], ...(JSON.parse(raw) as Partial<CustomFramesIndex>) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { frames: [] };
    throw err;
  }
}

async function writeIndex(index: CustomFramesIndex): Promise<void> {
  await fs.mkdir(CUSTOM_FRAMES_ROOT, { recursive: true });
  await fs.writeFile(customFramesIndexPath(), JSON.stringify(index, null, 2), "utf-8");
}

/** All uploaded custom frames, newest first. */
export async function listCustomFrames(): Promise<CustomFrame[]> {
  const index = await readIndex();
  return [...index.frames].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readCustomFrame(id: string): Promise<CustomFrame | null> {
  const index = await readIndex();
  return index.frames.find((frame) => frame.id === assertSafeId(id)) ?? null;
}

// Average of the top/bottom edge lengths for width, left/right edge lengths
// for height — a reasonable "natural" rectangle size for a quad that isn't
// a perfect rectangle, used as the review screen's suggested crop aspect.
function suggestedAspectFromQuad(quad: FrameScreenQuad): number {
  const dist = (a: { xPct: number; yPct: number }, b: { xPct: number; yPct: number }) =>
    Math.hypot(b.xPct - a.xPct, b.yPct - a.yPct);
  const width = (dist(quad.topLeft, quad.topRight) + dist(quad.bottomLeft, quad.bottomRight)) / 2;
  const height = (dist(quad.topLeft, quad.bottomLeft) + dist(quad.topRight, quad.bottomRight)) / 2;
  return width / height;
}

export async function saveCustomFrame(
  buffer: Buffer,
  name: string,
  extension: string,
  imageWidth: number,
  imageHeight: number,
  screenQuad: FrameScreenQuad
): Promise<CustomFrame> {
  const id = generateCustomFrameId();
  const filename = `${id}.${extension}`;
  await fs.mkdir(CUSTOM_FRAMES_ROOT, { recursive: true });
  // Resolved from a fixed data root plus a freshly-generated id — safe against traversal.
  await fs.writeFile(path.join(/* turbopackIgnore: true */ CUSTOM_FRAMES_ROOT, filename), buffer);

  const frame: CustomFrame = {
    id,
    name,
    filename,
    imageWidth,
    imageHeight,
    screenQuad,
    suggestedAspect: suggestedAspectFromQuad(screenQuad),
    createdAt: new Date().toISOString(),
  };

  const index = await readIndex();
  index.frames.push(frame);
  await writeIndex(index);
  return frame;
}

/** Removes a frame from the library and deletes its file. Does not touch boards — see `clearCustomFrameFromAllBoardItems`. */
export async function deleteCustomFrame(id: string): Promise<void> {
  const safeId = assertSafeId(id);
  const index = await readIndex();
  const frame = index.frames.find((f) => f.id === safeId);
  if (!frame) return;

  index.frames = index.frames.filter((f) => f.id !== safeId);
  await writeIndex(index);
  await fs.rm(path.join(/* turbopackIgnore: true */ CUSTOM_FRAMES_ROOT, frame.filename), { force: true });
}
