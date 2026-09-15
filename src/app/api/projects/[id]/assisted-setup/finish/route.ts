import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { updateProject } from "@/lib/storage/projects";
import { finishAssistedSetup } from "@/lib/capture/assistedSetup";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;

  let id: string;
  try {
    id = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That project id looks invalid." }, { status: 400 });
  }

  const result = await finishAssistedSetup(id);
  if (!result) {
    return NextResponse.json({ error: "No Assisted Setup session is currently open for this project." }, { status: 404 });
  }

  const project = await updateProject(id, { assistedSetupAt: result.savedAt });
  return NextResponse.json({ savedAt: result.savedAt, project });
}
