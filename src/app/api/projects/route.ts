import { NextResponse } from "next/server";
import { validateCaptureUrl, UrlValidationError } from "@/lib/validation/url";
import { generateProjectId, HOME_PAGE_SLUG } from "@/lib/storage/paths";
import { writeProject, listProjects } from "@/lib/storage/projects";
import { readSettings } from "@/lib/storage/settings";
import type { ProjectData } from "@/types/project";

export const runtime = "nodejs";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const rawName = record.name;
  const rawUrl = record.mainUrl;
  const rawCategory = record.category;

  if (typeof rawName !== "string" || rawName.trim().length === 0) {
    return NextResponse.json({ error: "A project name is required." }, { status: 400 });
  }
  if (typeof rawUrl !== "string") {
    return NextResponse.json({ error: "A main website URL is required." }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = validateCaptureUrl(rawUrl);
  } catch (err) {
    if (err instanceof UrlValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
  }

  const category = typeof rawCategory === "string" && rawCategory.trim().length > 0 ? rawCategory.trim() : null;

  const settings = await readSettings();
  const now = new Date().toISOString();
  const project: ProjectData = {
    id: generateProjectId(),
    name: rawName.trim(),
    mainUrl: parsedUrl.toString(),
    category,
    headline: null,
    description: null,
    accentColor: "#6366f1",
    backgroundPreference: "dark",
    logoPath: settings.agencyLogoPath,
    servicesDelivered: [...settings.standardServices],
    technologiesUsed: [],
    approvedPages: [{ slug: HOME_PAGE_SLUG, url: parsedUrl.toString(), label: "Home" }],
    createdAt: now,
    updatedAt: now,
  };

  await writeProject(project);
  return NextResponse.json({ project }, { status: 201 });
}
