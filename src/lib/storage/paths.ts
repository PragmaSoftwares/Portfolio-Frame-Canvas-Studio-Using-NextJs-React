import path from "node:path";
import { nanoid } from "nanoid";

// All local project data lives under <repo>/data, outside of src and public,
// so it's never bundled or served directly by Next.js.
export const DATA_ROOT = path.join(process.cwd(), "data");
export const PROJECTS_ROOT = path.join(DATA_ROOT, "projects");
export const SETTINGS_PATH = path.join(DATA_ROOT, "settings.json");
// Uploaded board background images — global and project-independent, so the
// same uploaded background can be reused across every project's boards.
export const BACKGROUNDS_ROOT = path.join(DATA_ROOT, "backgrounds");

// The project's main URL is always captured as this fixed page slug.
// Additional approved pages (Phase 3) get generated slugs — see lib/storage/pages.ts.
export const HOME_PAGE_SLUG = "home";

export type CaptureDevice = "desktop" | "laptop" | "tablet" | "mobile";

const ID_PATTERN = /^[a-zA-Z0-9_-]{6,32}$/;
const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

export function generateProjectId(): string {
  return nanoid(12);
}

export function generateBoardId(): string {
  return nanoid(12);
}

export function generateBackgroundImageId(): string {
  return nanoid(12);
}

/** Guards against path traversal when an id comes back through an API route. */
export function assertSafeId(id: string): string {
  if (!ID_PATTERN.test(id)) {
    throw new Error("Invalid id.");
  }
  return id;
}

/** Guards against path traversal for page slugs / template ids used in filenames. */
export function assertSafeSlug(slug: string): string {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error("Invalid slug.");
  }
  return slug;
}

export function projectDir(id: string): string {
  return path.join(PROJECTS_ROOT, assertSafeId(id));
}

export function projectCapturesDir(id: string): string {
  return path.join(projectDir(id), "captures");
}

export function projectCaptureDeviceDir(id: string, device: CaptureDevice): string {
  return path.join(projectCapturesDir(id), device);
}

export function projectCaptureMetaDir(id: string): string {
  return path.join(projectCapturesDir(id), "meta");
}

export function projectCaptureSelectionsDir(id: string): string {
  return path.join(projectCapturesDir(id), "selections");
}

export function projectExportsDir(id: string): string {
  return path.join(projectDir(id), "exports");
}

export function projectExportMetaDir(id: string): string {
  return path.join(projectExportsDir(id), "meta");
}

export function projectBoardsDir(id: string): string {
  return path.join(projectDir(id), "boards");
}

export function backgroundsIndexPath(): string {
  return path.join(BACKGROUNDS_ROOT, "index.json");
}
