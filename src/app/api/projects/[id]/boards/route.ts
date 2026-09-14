import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { readProject } from "@/lib/storage/projects";
import { listBoards, createBoard } from "@/lib/storage/boards";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  let projectId: string;
  try {
    projectId = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That project id looks invalid." }, { status: 400 });
  }

  const boards = await listBoards(projectId);
  return NextResponse.json({ boards });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  let projectId: string;
  try {
    projectId = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That project id looks invalid." }, { status: 400 });
  }

  const project = await readProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const name = typeof record.name === "string" && record.name.trim().length > 0 ? record.name.trim() : "Untitled board";

  const board = await createBoard(projectId, name);
  return NextResponse.json({ board }, { status: 201 });
}
