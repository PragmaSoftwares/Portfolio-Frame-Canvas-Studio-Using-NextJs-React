import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { duplicateProject } from "@/lib/storage/projects";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;

  let id: string;
  try {
    id = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That project id looks invalid." }, { status: 400 });
  }

  const copy = await duplicateProject(id);
  if (!copy) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({ project: copy }, { status: 201 });
}
