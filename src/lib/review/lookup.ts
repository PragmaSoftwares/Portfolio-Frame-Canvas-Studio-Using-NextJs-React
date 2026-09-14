import { readProject } from "@/lib/storage/projects";
import { readPageCaptureMeta } from "@/lib/storage/captures";
import type { ProjectData, ApprovedPage } from "@/types/project";
import type { PageCaptureMeta } from "@/types/capture";

export interface LookupError {
  error: string;
  status: number;
}

export interface LookupResult {
  project: ProjectData;
  page: ApprovedPage;
  capture: PageCaptureMeta | null;
}

export async function findProjectPage(projectId: string, pageSlug: string): Promise<LookupResult | LookupError> {
  const project = await readProject(projectId);
  if (!project) return { error: "Project not found.", status: 404 };

  const page = project.approvedPages.find((p) => p.slug === pageSlug);
  if (!page) return { error: "Page not found on this project.", status: 404 };

  const capture = await readPageCaptureMeta(projectId, pageSlug);
  return { project, page, capture };
}

export function isLookupError(result: LookupResult | LookupError): result is LookupError {
  return "error" in result;
}
