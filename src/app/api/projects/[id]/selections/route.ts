import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { readProject } from "@/lib/storage/projects";
import { listAllSelections } from "@/lib/storage/review";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  let projectId: string;
  try {
    projectId = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That project id looks invalid." }, { status: 400 });
  }

  const project = await readProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const selections = await listAllSelections(projectId, project.approvedPages);
  return NextResponse.json({ selections });
}
