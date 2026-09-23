import { NextResponse } from "next/server";
import { listProjects } from "@/lib/storage/projects";

export const runtime = "nodejs";

// force-dynamic for the same reason src/app/page.tsx needs it — this reads
// every project.json straight off disk, which Next has no way to know can
// change between requests.
export const dynamic = "force-dynamic";

/**
 * The full set of tags currently in use across every project — there's no
 * separate tag registry, so "recently used" and "known" tags are just
 * whatever's actually attached to a project right now. Used by TagPicker
 * (New Project, and editing an existing project's tags) for autocomplete,
 * and by the dashboard's tag filter for its checkbox list.
 */
export async function GET() {
  const projects = await listProjects();

  // De-dupe case-insensitively, keeping whichever casing was seen first, so
  // "Marketing" and "marketing" (typed on different occasions) collapse into
  // one suggestion instead of two near-identical ones.
  const seen = new Map<string, string>();
  for (const project of projects) {
    for (const tag of project.tags) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }

  const tags = Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ tags });
}
