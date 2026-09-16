import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { duplicateBoard } from "@/lib/storage/boards";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; boardId: string }> }) {
  const { id: rawId, boardId: rawBoardId } = await params;

  let projectId: string;
  let boardId: string;
  try {
    projectId = assertSafeId(rawId);
    boardId = assertSafeId(rawBoardId);
  } catch {
    return NextResponse.json({ error: "That id looks invalid." }, { status: 400 });
  }

  const copy = await duplicateBoard(projectId, boardId);
  if (!copy) {
    return NextResponse.json({ error: "Board not found." }, { status: 404 });
  }

  return NextResponse.json({ board: copy }, { status: 201 });
}
