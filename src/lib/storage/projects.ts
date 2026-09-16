import fs from "node:fs/promises";
import path from "node:path";
import { PROJECTS_ROOT, HOME_PAGE_SLUG, generateProjectId, projectDir } from "./paths";
import type { ProjectData } from "@/types/project";

const PROJECT_FILENAME = "project.json";

export async function writeProject(project: ProjectData): Promise<void> {
  const dir = projectDir(project.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, PROJECT_FILENAME), JSON.stringify(project, null, 2), "utf-8");
}

/**
 * Upgrades project.json read from disk that predates Phase 3's structured
 * approvedPages field (Phase 2 only ever stored approvedPageUrls: string[]).
 */
function migrateProject(raw: Record<string, unknown>): ProjectData {
  if (!Array.isArray(raw.approvedPages)) {
    const legacyUrls = Array.isArray(raw.approvedPageUrls) ? (raw.approvedPageUrls as string[]) : [String(raw.mainUrl)];
    raw.approvedPages = legacyUrls.map((url, index) => ({
      slug: index === 0 ? HOME_PAGE_SLUG : `page-legacy-${index}`,
      url,
      label: index === 0 ? "Home" : url,
    }));
  }
  delete raw.approvedPageUrls;
  // Watermark moved from per-project to agency-wide (AgencySettings) — drop
  // the now-unused stored field from anything written before that change.
  delete raw.watermark;
  // These belonged to the template-based board system, deleted when the
  // free-form canvas replaced it — nothing has read any of them since, so
  // drop them from anything written before the Customize page itself was
  // removed rather than carrying dead keys forward indefinitely.
  delete raw.headline;
  delete raw.description;
  delete raw.accentColor;
  delete raw.backgroundPreference;
  delete raw.logoPath;
  delete raw.servicesDelivered;
  delete raw.technologiesUsed;
  if (raw.assistedSetupAt === undefined) raw.assistedSetupAt = null;
  return raw as unknown as ProjectData;
}

export async function readProject(id: string): Promise<ProjectData | null> {
  try {
    const raw = await fs.readFile(path.join(projectDir(id), PROJECT_FILENAME), "utf-8");
    return migrateProject(JSON.parse(raw) as Record<string, unknown>);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function listProjects(): Promise<ProjectData[]> {
  let entries;
  try {
    entries = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const projects: ProjectData[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await fs.readFile(path.join(PROJECTS_ROOT, entry.name, PROJECT_FILENAME), "utf-8");
      projects.push(migrateProject(JSON.parse(raw) as Record<string, unknown>));
    } catch {
      // Skip directories that don't contain a valid project.json.
    }
  }

  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return projects;
}

export async function deleteProject(id: string): Promise<void> {
  await fs.rm(projectDir(id), { recursive: true, force: true });
}

export interface UpdateProjectPatch {
  name?: string;
  mainUrl?: string;
  category?: string | null;
  assistedSetupAt?: string | null;
}

export async function updateProject(id: string, patch: UpdateProjectPatch): Promise<ProjectData | null> {
  const existing = await readProject(id);
  if (!existing) return null;

  const approvedPages =
    patch.mainUrl && patch.mainUrl !== existing.mainUrl
      ? existing.approvedPages.map((p) => (p.slug === HOME_PAGE_SLUG ? { ...p, url: patch.mainUrl! } : p))
      : existing.approvedPages;

  const updated: ProjectData = {
    ...existing,
    ...patch,
    approvedPages,
    updatedAt: new Date().toISOString(),
  };
  await writeProject(updated);
  return updated;
}

export async function touchProject(id: string): Promise<void> {
  const existing = await readProject(id);
  if (!existing) return;
  existing.updatedAt = new Date().toISOString();
  await writeProject(existing);
}

/**
 * Duplicates a project's metadata (name, URL, category, pages) under a new
 * id. Captures and exports are not copied — they belong to the original
 * project's screenshots, not to the new one.
 */
export async function duplicateProject(id: string): Promise<ProjectData | null> {
  const source = await readProject(id);
  if (!source) return null;

  const now = new Date().toISOString();
  const copy: ProjectData = {
    ...source,
    id: generateProjectId(),
    name: `${source.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };
  await writeProject(copy);
  return copy;
}
