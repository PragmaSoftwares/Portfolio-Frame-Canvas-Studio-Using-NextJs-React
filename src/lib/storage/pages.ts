import fs from "node:fs/promises";
import { customAlphabet } from "nanoid";
import { HOME_PAGE_SLUG, projectCaptureDeviceDir, projectCaptureMetaDir } from "./paths";
import { readProject, writeProject } from "./projects";
import { deletePageSelections } from "./review";
import { removePageFromBoards } from "./boards";
import type { ApprovedPage, ProjectData } from "@/types/project";

// The homepage is always included and doesn't count against this limit (section 13 of the plan).
export const MAX_ADDITIONAL_PAGES = 5;

const slugId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 8);

export function generatePageSlug(): string {
  return `page-${slugId()}`;
}

export class PageLimitError extends Error {
  constructor() {
    super(`You can add up to ${MAX_ADDITIONAL_PAGES} additional pages.`);
    this.name = "PageLimitError";
  }
}

export class DuplicatePageError extends Error {
  constructor() {
    super("That page URL is already on this project.");
    this.name = "DuplicatePageError";
  }
}

function normalizeForComparison(url: string): string {
  return url.replace(/\/+$/, "").toLowerCase();
}

function defaultLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const trimmedPath = parsed.pathname.replace(/\/+$/, "");
    return trimmedPath.length > 0 ? trimmedPath : "Home";
  } catch {
    return url;
  }
}

export async function addApprovedPage(
  projectId: string,
  url: string,
  label?: string
): Promise<{ project: ProjectData; page: ApprovedPage }> {
  const project = await readProject(projectId);
  if (!project) throw new Error("Project not found.");

  const additionalCount = project.approvedPages.length - 1;
  if (additionalCount >= MAX_ADDITIONAL_PAGES) {
    throw new PageLimitError();
  }

  const normalized = normalizeForComparison(url);
  if (project.approvedPages.some((p) => normalizeForComparison(p.url) === normalized)) {
    throw new DuplicatePageError();
  }

  const page: ApprovedPage = {
    slug: generatePageSlug(),
    url,
    label: label?.trim() || defaultLabel(url),
  };

  const updated: ProjectData = {
    ...project,
    approvedPages: [...project.approvedPages, page],
    updatedAt: new Date().toISOString(),
  };
  await writeProject(updated);
  return { project: updated, page };
}

export async function removeApprovedPage(projectId: string, slug: string): Promise<ProjectData> {
  const project = await readProject(projectId);
  if (!project) throw new Error("Project not found.");

  if (slug === HOME_PAGE_SLUG) {
    throw new Error("The homepage can't be removed. Change the main URL instead.");
  }

  const exists = project.approvedPages.some((p) => p.slug === slug);
  if (!exists) throw new Error("Page not found on this project.");

  const updated: ProjectData = {
    ...project,
    approvedPages: project.approvedPages.filter((p) => p.slug !== slug),
    updatedAt: new Date().toISOString(),
  };
  await writeProject(updated);

  await cleanupPageFiles(projectId, slug);
  await removePageFromBoards(projectId, slug);
  return updated;
}

async function cleanupPageFiles(projectId: string, slug: string): Promise<void> {
  const devices = ["desktop", "laptop", "tablet", "mobile"] as const;
  await Promise.all(
    devices.flatMap((device) => {
      const dir = projectCaptureDeviceDir(projectId, device);
      return [fs.rm(`${dir}/${slug}.png`, { force: true }), fs.rm(`${dir}/${slug}-full.png`, { force: true })];
    })
  );
  await fs.rm(`${projectCaptureMetaDir(projectId)}/${slug}.json`, { force: true });
  await deletePageSelections(projectId, slug);
}
