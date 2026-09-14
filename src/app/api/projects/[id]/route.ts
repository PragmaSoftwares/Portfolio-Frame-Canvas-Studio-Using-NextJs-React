import { NextResponse } from "next/server";
import { validateCaptureUrl, UrlValidationError } from "@/lib/validation/url";
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

  if ("category" in record) {
    patch.category =
      typeof record.category === "string" && record.category.trim().length > 0 ? record.category.trim() : null;
  }

  if ("headline" in record) {
    patch.headline =
      typeof record.headline === "string" && record.headline.trim().length > 0 ? record.headline.trim() : null;
  }

  if ("description" in record) {
    patch.description =
      typeof record.description === "string" && record.description.trim().length > 0
        ? record.description.trim()
        : null;
  }

  if ("accentColor" in record) {
    if (typeof record.accentColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(record.accentColor)) {
      return NextResponse.json({ error: "Accent colour must be a hex value like #6366f1." }, { status: 400 });
    }
    patch.accentColor = record.accentColor;
  }

  if ("backgroundPreference" in record) {
    if (record.backgroundPreference !== "light" && record.backgroundPreference !== "dark") {
      return NextResponse.json({ error: "Background must be \"light\" or \"dark\"." }, { status: 400 });
    }
    patch.backgroundPreference = record.backgroundPreference;
  }

  if ("logoPath" in record) {
    patch.logoPath =
      typeof record.logoPath === "string" && record.logoPath.trim().length > 0 ? record.logoPath.trim() : null;
  }

  if ("watermark" in record) {
    const w = record.watermark as Record<string, unknown>;
    if (typeof w !== "object" || w === null || typeof w.text !== "string" || typeof w.visible !== "boolean") {
      return NextResponse.json({ error: "Invalid watermark value." }, { status: 400 });
    }
    patch.watermark = { text: w.text, visible: w.visible };
  }

  if ("servicesDelivered" in record) {
    if (!Array.isArray(record.servicesDelivered) || !record.servicesDelivered.every((s) => typeof s === "string")) {
      return NextResponse.json({ error: "servicesDelivered must be a list of strings." }, { status: 400 });
    }
    patch.servicesDelivered = record.servicesDelivered.filter((s: string) => s.trim().length > 0);
  }

  if ("technologiesUsed" in record) {
    if (!Array.isArray(record.technologiesUsed) || !record.technologiesUsed.every((s) => typeof s === "string")) {
      return NextResponse.json({ error: "technologiesUsed must be a list of strings." }, { status: 400 });
    }
    patch.technologiesUsed = record.technologiesUsed.filter((s: string) => s.trim().length > 0);
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
