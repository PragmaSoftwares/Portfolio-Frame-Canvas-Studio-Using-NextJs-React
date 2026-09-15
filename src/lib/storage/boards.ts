import fs from "node:fs/promises";
import path from "node:path";
import { projectBoardsDir, generateBoardId, assertSafeId } from "./paths";
import { getLastUsedBackground, setLastUsedBackground } from "./backgroundImages";
import { listProjects } from "./projects";
import type { Board, BoardBackground, BackgroundFit, CanvasItem } from "@/types/board";

// Matches Upwork's own recommended portfolio image size (4:3, scaled up for
// export quality) per docs/mockups-examples/Upwork_Portfolio_Design_Brief.md —
// "Recommended Dimensions: 1000 x 750 pixels, Aspect Ratio: 4:3".
const DEFAULT_CANVAS_WIDTH = 2000;
const DEFAULT_CANVAS_HEIGHT = 1500;

function boardPath(projectId: string, boardId: string): string {
  return path.join(projectBoardsDir(assertSafeId(projectId)), `${assertSafeId(boardId)}.json`);
}

// Every item used to implicitly be a screenshot — text items didn't exist —
// so a board file saved before that has items with no `kind` field at all.
// Backfill it on read rather than forcing a one-time migration script. Text
// items also gained textTransform/verticalAlign/opacity after they first
// shipped, so backfill those too for any text item saved in that window.
function migrateBoard(raw: Record<string, unknown>): Board {
  if (Array.isArray(raw.items)) {
    raw.items = raw.items.map((item) => {
      if (typeof item !== "object" || item === null) return item;
      const record = item as Record<string, unknown>;
      if (record.kind === undefined) return { ...record, kind: "screenshot" };
      if (record.kind === "text") {
        return { textTransform: "none", verticalAlign: "top", opacity: 1, ...record };
      }
      return record;
    });
  }
  return raw as unknown as Board;
}

export async function listBoards(projectId: string): Promise<Board[]> {
  let entries;
  try {
    entries = await fs.readdir(projectBoardsDir(assertSafeId(projectId)), { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const boards: Board[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(projectBoardsDir(projectId), entry.name), "utf-8");
      boards.push(migrateBoard(JSON.parse(raw) as Record<string, unknown>));
    } catch {
      // Skip unreadable/corrupt board files.
    }
  }
  boards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return boards;
}

export async function readBoard(projectId: string, boardId: string): Promise<Board | null> {
  try {
    const raw = await fs.readFile(boardPath(projectId, boardId), "utf-8");
    return migrateBoard(JSON.parse(raw) as Record<string, unknown>);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeBoard(board: Board): Promise<void> {
  const dir = projectBoardsDir(board.projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(boardPath(board.projectId, board.id), JSON.stringify(board, null, 2), "utf-8");
}

// New boards default to whatever background was last saved on any board across
// every project, so an uploaded background doesn't need to be re-picked (or
// re-uploaded) each time — falls back to "dark" the very first time, before
// anything has ever been saved.
export async function createBoard(projectId: string, name: string): Promise<Board> {
  const now = new Date().toISOString();
  const lastUsed = await getLastUsedBackground();
  const board: Board = {
    id: generateBoardId(),
    projectId,
    name,
    canvasWidth: DEFAULT_CANVAS_WIDTH,
    canvasHeight: DEFAULT_CANVAS_HEIGHT,
    background: lastUsed?.background ?? "dark",
    backgroundImageId: lastUsed?.background === "image" ? lastUsed.backgroundImageId : undefined,
    backgroundFit: lastUsed?.background === "image" ? lastUsed.backgroundFit : undefined,
    items: [],
    createdAt: now,
    updatedAt: now,
  };
  await writeBoard(board);
  return board;
}

export interface BoardPatch {
  name?: string;
  background?: BoardBackground;
  backgroundImageId?: string | null;
  backgroundFit?: BackgroundFit;
  items?: CanvasItem[];
}

export async function updateBoard(projectId: string, boardId: string, patch: BoardPatch): Promise<Board | null> {
  const existing = await readBoard(projectId, boardId);
  if (!existing) return null;
  const updated: Board = {
    ...existing,
    ...patch,
    backgroundImageId: patch.backgroundImageId === null ? undefined : (patch.backgroundImageId ?? existing.backgroundImageId),
    updatedAt: new Date().toISOString(),
  };
  await writeBoard(updated);

  // Track "last used" whenever any background-related field changed, not just
  // `background` itself — e.g. picking a different image or fit while already
  // in "image" mode should still update what the next new board defaults to.
  if (patch.background !== undefined || patch.backgroundImageId !== undefined || patch.backgroundFit !== undefined) {
    await setLastUsedBackground({
      background: updated.background,
      backgroundImageId: updated.background === "image" ? updated.backgroundImageId : undefined,
      backgroundFit: updated.background === "image" ? updated.backgroundFit : undefined,
    });
  }

  return updated;
}

export async function deleteBoard(projectId: string, boardId: string): Promise<void> {
  await fs.rm(boardPath(projectId, boardId), { force: true });
}

// Called when a screenshot selection is deleted, so no board keeps a canvas item
// pointing at a file that no longer exists.
export async function removeSelectionFromBoards(projectId: string, selectionId: string): Promise<void> {
  const boards = await listBoards(projectId);
  for (const board of boards) {
    if (!board.items.some((item) => item.kind === "screenshot" && item.selectionId === selectionId)) continue;
    await writeBoard({
      ...board,
      items: board.items.filter((item) => !(item.kind === "screenshot" && item.selectionId === selectionId)),
      updatedAt: new Date().toISOString(),
    });
  }
}

// Called when an entire page (and all of its selections) is removed from a project.
export async function removePageFromBoards(projectId: string, pageSlug: string): Promise<void> {
  const boards = await listBoards(projectId);
  for (const board of boards) {
    if (!board.items.some((item) => item.kind === "screenshot" && item.pageSlug === pageSlug)) continue;
    await writeBoard({
      ...board,
      items: board.items.filter((item) => !(item.kind === "screenshot" && item.pageSlug === pageSlug)),
      updatedAt: new Date().toISOString(),
    });
  }
}

// Called when a background image is deleted from the global library, so no
// board (in any project — the library isn't project-scoped) keeps pointing at
// a file that no longer exists. Falls back to the dark gradient, same as a
// brand-new board.
export async function clearBackgroundImageFromAllBoards(imageId: string): Promise<void> {
  const projects = await listProjects();
  for (const project of projects) {
    const boards = await listBoards(project.id);
    for (const board of boards) {
      if (board.backgroundImageId !== imageId) continue;
      await writeBoard({
        ...board,
        background: "dark",
        backgroundImageId: undefined,
        backgroundFit: undefined,
        updatedAt: new Date().toISOString(),
      });
    }
  }
}
