import { notFound } from "next/navigation";
import { readProject } from "@/lib/storage/projects";
import { readBoard } from "@/lib/storage/boards";
import { listAllSelections } from "@/lib/storage/review";
import { listBackgroundImages } from "@/lib/storage/backgroundImages";
import { CanvasEditor } from "@/components/canvas/CanvasEditor";

interface BoardPageProps {
  params: Promise<{ id: string; boardId: string }>;
}

export default async function BoardPage({ params }: BoardPageProps) {
  const { id, boardId } = await params;
  const project = await readProject(id);
  if (!project) notFound();

  const board = await readBoard(id, boardId);
  if (!board) notFound();

  const selections = await listAllSelections(id, project.approvedPages);
  const backgroundImages = await listBackgroundImages();

  return (
    <CanvasEditor
      projectId={id}
      projectName={project.name}
      board={board}
      selections={selections}
      backgroundImages={backgroundImages}
    />
  );
}
