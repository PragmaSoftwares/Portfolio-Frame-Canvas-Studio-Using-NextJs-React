import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { projectCaptureSelectionsDir, assertSafeId, assertSafeSlug } from "./paths";
import type { ScreenshotSelection } from "@/types/review";
import type { ApprovedPage } from "@/types/project";

function selectionsJsonPath(projectId: string, pageSlug: string): string {
  return path.join(projectCaptureSelectionsDir(assertSafeId(projectId)), `${assertSafeSlug(pageSlug)}.json`);
}

export async function readPageSelections(projectId: string, pageSlug: string): Promise<ScreenshotSelection[]> {
  try {
    const raw = await fs.readFile(selectionsJsonPath(projectId, pageSlug), "utf-8");
    return JSON.parse(raw) as ScreenshotSelection[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writePageSelections(projectId: string, pageSlug: string, selections: ScreenshotSelection[]): Promise<void> {
  const dir = projectCaptureSelectionsDir(assertSafeId(projectId));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(selectionsJsonPath(projectId, pageSlug), JSON.stringify(selections, null, 2), "utf-8");
}

export interface NewSelectionInput {
  label: string;
  sourceDevice: ScreenshotSelection["sourceDevice"];
  cropRect: ScreenshotSelection["cropRect"];
  filename: string;
  width: number;
  height: number;
}

export async function addSelection(
  projectId: string,
  pageSlug: string,
  input: NewSelectionInput
): Promise<ScreenshotSelection> {
  const selections = await readPageSelections(projectId, pageSlug);
  const selection: ScreenshotSelection = {
    id: nanoid(10),
    pageSlug,
    createdAt: new Date().toISOString(),
    ...input,
  };
  await writePageSelections(projectId, pageSlug, [...selections, selection]);
  return selection;
}

export async function removeSelection(projectId: string, pageSlug: string, selectionId: string): Promise<void> {
  const selections = await readPageSelections(projectId, pageSlug);
  const target = selections.find((s) => s.id === selectionId);
  if (!target) return;

  await writePageSelections(
    projectId,
    pageSlug,
    selections.filter((s) => s.id !== selectionId)
  );
  await fs.rm(path.join(projectCaptureSelectionsDir(projectId), target.filename), { force: true });
}

export interface SelectionWithPage extends ScreenshotSelection {
  pageLabel: string;
}

export async function listAllSelections(
  projectId: string,
  approvedPages: ApprovedPage[]
): Promise<SelectionWithPage[]> {
  const all: SelectionWithPage[] = [];
  for (const page of approvedPages) {
    const selections = await readPageSelections(projectId, page.slug);
    for (const s of selections) all.push({ ...s, pageLabel: page.label });
  }
  return all;
}

export async function deletePageSelections(projectId: string, pageSlug: string): Promise<void> {
  const selections = await readPageSelections(projectId, pageSlug);
  const dir = projectCaptureSelectionsDir(assertSafeId(projectId));
  await Promise.all(selections.map((s) => fs.rm(path.join(dir, s.filename), { force: true })));
  await fs.rm(selectionsJsonPath(projectId, pageSlug), { force: true });
}
