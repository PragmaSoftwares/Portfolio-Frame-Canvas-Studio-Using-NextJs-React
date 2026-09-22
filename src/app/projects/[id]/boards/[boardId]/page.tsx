import { notFound } from "next/navigation";
import { readProject } from "@/lib/storage/projects";
import { readBoard } from "@/lib/storage/boards";
import { listAllSelections } from "@/lib/storage/review";
import { listBackgroundImages } from "@/lib/storage/backgroundImages";
import { listCustomFrames } from "@/lib/storage/customFrames";
import { readSettings } from "@/lib/storage/settings";
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
  const customFrames = await listCustomFrames();
  const settings = await readSettings();

  return (
    <CanvasEditor
      projectId={id}
      projectName={project.name}
      board={board}
      selections={selections}
      backgroundImages={backgroundImages}
      customFrames={customFrames}
      watermarkVisible={settings.defaultWatermarkVisible}
      watermarkText={settings.defaultWatermarkText}
      watermarkColor={settings.watermarkColor}
      watermarkLineWidth={settings.watermarkLineWidth}
      watermarkFontSize={settings.watermarkFontSize}
      watermarkOpacity={settings.watermarkOpacity}
      watermarkFontFamily={settings.defaultFontFamily}
    />
  );
}
