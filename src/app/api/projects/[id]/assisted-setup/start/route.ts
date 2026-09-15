import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { readProject } from "@/lib/storage/projects";
import { startAssistedSetup } from "@/lib/capture/assistedSetup";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;

  let id: string;
  try {
    id = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That project id looks invalid." }, { status: 400 });
  }

  const project = await readProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // Optional: start on a specific page (e.g. one where the promo popup was
  // spotted) instead of the project's main URL. The user can navigate
  // freely within the opened window regardless.
  let url = project.mainUrl;
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url === "string" && body.url.trim().length > 0) {
      url = body.url.trim();
    }
  } catch {
    // No/invalid JSON body — fall back to mainUrl, not an error.
  }

  const status = await startAssistedSetup(id, url);
  return NextResponse.json({ status });
}
