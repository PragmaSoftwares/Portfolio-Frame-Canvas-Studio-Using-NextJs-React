import { notFound } from "next/navigation";
import { readProject } from "@/lib/storage/projects";
import { readPageCaptureMeta } from "@/lib/storage/captures";
import { listBoards } from "@/lib/storage/boards";
import { listAllSelections } from "@/lib/storage/review";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";
import { AppHeader } from "@/components/nav/AppHeader";
import type { PageCaptureMeta } from "@/types/capture";

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const project = await readProject(id);
  if (!project) notFound();

  const captures: Record<string, PageCaptureMeta> = {};
  for (const page of project.approvedPages) {
    const capture = await readPageCaptureMeta(id, page.slug);
    if (capture) captures[page.slug] = capture;
  }

  const boards = await listBoards(id);
  const selections = await listAllSelections(id, project.approvedPages);

  return (
    <>
      <AppHeader />
      <ProjectWorkspace project={project} initialCaptures={captures} initialBoards={boards} selectionCount={selections.length} />
    </>
  );
}
