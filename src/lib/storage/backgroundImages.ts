import fs from "node:fs/promises";
import path from "node:path";
import { BACKGROUNDS_ROOT, backgroundsIndexPath, generateBackgroundImageId, assertSafeId } from "./paths";
import type { BackgroundImage, LastUsedBackground } from "@/types/backgroundImage";

interface BackgroundsIndex {
  images: BackgroundImage[];
  lastUsed?: LastUsedBackground;
}

async function readIndex(): Promise<BackgroundsIndex> {
  try {
    const raw = await fs.readFile(backgroundsIndexPath(), "utf-8");
    return { images: [], ...(JSON.parse(raw) as Partial<BackgroundsIndex>) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { images: [] };
    throw err;
  }
}

async function writeIndex(index: BackgroundsIndex): Promise<void> {
  await fs.mkdir(BACKGROUNDS_ROOT, { recursive: true });
  await fs.writeFile(backgroundsIndexPath(), JSON.stringify(index, null, 2), "utf-8");
}

/** All uploaded background images, newest first. */
export async function listBackgroundImages(): Promise<BackgroundImage[]> {
  const index = await readIndex();
  return [...index.images].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readBackgroundImage(id: string): Promise<BackgroundImage | null> {
  const index = await readIndex();
  return index.images.find((img) => img.id === assertSafeId(id)) ?? null;
}

export async function saveBackgroundImage(
  buffer: Buffer,
  originalName: string,
  extension: string,
  width: number,
  height: number
): Promise<BackgroundImage> {
  const id = generateBackgroundImageId();
  const filename = `${id}.${extension}`;
  await fs.mkdir(BACKGROUNDS_ROOT, { recursive: true });
  // Resolved from a fixed data root plus a freshly-generated id — safe against traversal.
  await fs.writeFile(path.join(/* turbopackIgnore: true */ BACKGROUNDS_ROOT, filename), buffer);

  const image: BackgroundImage = {
    id,
    filename,
    originalName,
    width,
    height,
    createdAt: new Date().toISOString(),
  };

  const index = await readIndex();
  index.images.push(image);
  await writeIndex(index);
  return image;
}

/** Removes an image from the library and deletes its file. Does not touch boards — see `clearBackgroundImageFromAllBoards`. */
export async function deleteBackgroundImage(id: string): Promise<void> {
  const safeId = assertSafeId(id);
  const index = await readIndex();
  const image = index.images.find((img) => img.id === safeId);
  if (!image) return;

  index.images = index.images.filter((img) => img.id !== safeId);
  if (index.lastUsed?.backgroundImageId === safeId) {
    index.lastUsed = undefined;
  }
  await writeIndex(index);
  await fs.rm(path.join(/* turbopackIgnore: true */ BACKGROUNDS_ROOT, image.filename), { force: true });
}

/** The background last saved on any board, across every project — new boards default to it. */
export async function getLastUsedBackground(): Promise<LastUsedBackground | null> {
  const index = await readIndex();
  return index.lastUsed ?? null;
}

export async function setLastUsedBackground(lastUsed: LastUsedBackground): Promise<void> {
  const index = await readIndex();
  index.lastUsed = lastUsed;
  await writeIndex(index);
}
