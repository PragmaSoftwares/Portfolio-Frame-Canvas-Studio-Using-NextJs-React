import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { readProject } from "@/lib/storage/projects";
import { listScrollVideos, createScrollVideo } from "@/lib/storage/scrollVideos";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  let projectId: string;
  try {
    projectId = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That project id looks invalid." }, { status: 400 });
  }

  const videos = await listScrollVideos(projectId);
  return NextResponse.json({ videos });
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
  const name = typeof record.name === "string" && record.name.trim().length > 0 ? record.name.trim() : "Untitled scroll video";

  const video = await createScrollVideo(projectId, name);
  return NextResponse.json({ video }, { status: 201 });
}
