import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { assertSafeId, projectExportsDir, projectExportMetaDir } from "@/lib/storage/paths";
import { readBoard } from "@/lib/storage/boards";
import { exportBoardToPng, ExportError, EXPORT_SCALE_FACTOR } from "@/lib/export/exportBoard";
import type { ExportMeta } from "@/types/capture";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; boardId: string }> }) {
  const { id: rawId, boardId: rawBoardId } = await params;
  let projectId: string;
  let boardId: string;
  try {
    projectId = assertSafeId(rawId);
    boardId = assertSafeId(rawBoardId);
  } catch {
    return NextResponse.json({ error: "That id looks invalid." }, { status: 400 });
  }

  const board = await readBoard(projectId, boardId);
  if (!board) {
    return NextResponse.json({ error: "Board not found." }, { status: 404 });
  }
  if (board.items.length === 0) {
    return NextResponse.json({ error: "Add at least one item to the canvas before exporting." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const renderUrl = `${origin}/render/board/${projectId}/${boardId}`;

  try {
    const png = await exportBoardToPng(renderUrl, { width: board.canvasWidth, height: board.canvasHeight });

    const dir = projectExportsDir(projectId);
    await fs.mkdir(dir, { recursive: true });
    const filename = `${boardId}.png`;
    await fs.writeFile(path.join(dir, filename), png);

    const exportMeta: ExportMeta = {
      projectId,
      templateId: boardId,
      createdAt: new Date().toISOString(),
      file: filename,
      // The actual output PNG's pixel dimensions, not the board's own CSS
      // pixel layout size — exportBoardToPng renders at EXPORT_SCALE_FACTOR
      // for a sharp, retina-ready file. See exportBoard.ts.
      width: board.canvasWidth * EXPORT_SCALE_FACTOR,
      height: board.canvasHeight * EXPORT_SCALE_FACTOR,
    };
    const metaDir = projectExportMetaDir(projectId);
    await fs.mkdir(metaDir, { recursive: true });
    await fs.writeFile(path.join(metaDir, `${boardId}.json`), JSON.stringify(exportMeta, null, 2), "utf-8");

    return NextResponse.json({
      export: exportMeta,
      url: `/api/media/projects/${projectId}/exports/${filename}`,
    });
  } catch (err) {
    const message = err instanceof ExportError ? err.message : "Export failed unexpectedly.";
    console.error("Board export failed:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
