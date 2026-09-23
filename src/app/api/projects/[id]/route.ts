import { NextResponse } from "next/server";
import { validateCaptureUrl, UrlValidationError } from "@/lib/validation/url";
import { normalizeTags } from "@/lib/validation/tags";
import { assertSafeId } from "@/lib/storage/paths";
import { readProject, updateProject, deleteProject, type UpdateProjectPatch } from "@/lib/storage/projects";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;

  let id: string;
  try {
    id = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That project id looks invalid." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const patch: UpdateProjectPatch = {};

  if ("name" in record) {
    if (typeof record.name !== "string" || record.name.trim().length === 0) {
      return NextResponse.json({ error: "Project name can't be empty." }, { status: 400 });
    }
    patch.name = record.name.trim();
  }

  if ("mainUrl" in record) {
    if (typeof record.mainUrl !== "string") {
      return NextResponse.json({ error: "A main website URL is required." }, { status: 400 });
    }
    try {
      patch.mainUrl = validateCaptureUrl(record.mainUrl).toString();
    } catch (err) {
      const message = err instanceof UrlValidationError ? err.message : "That doesn't look like a valid URL.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if ("tags" in record) {
    const parsed = normalizeTags(record.tags);
    if (parsed === null) {
      return NextResponse.json({ error: "Tags must be a list of strings." }, { status: 400 });
    }
    patch.tags = parsed;
  }

  if ("manualUploadEnabled" in record) {
    if (typeof record.manualUploadEnabled !== "boolean") {
      return NextResponse.json({ error: "manualUploadEnabled must be a boolean." }, { status: 400 });
    }
    patch.manualUploadEnabled = record.manualUploadEnabled;
  }

  const updated = await updateProject(id, patch);
  if (!updated) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({ project: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;

  let id: string;
  try {
    id = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That project id looks invalid." }, { status: 400 });
  }

  const existing = await readProject(id);
  if (!existing) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  await deleteProject(id);
  return NextResponse.json({ ok: true });
}
