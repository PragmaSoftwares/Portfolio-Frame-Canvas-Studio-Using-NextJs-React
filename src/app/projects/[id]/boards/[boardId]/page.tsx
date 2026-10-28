import { notFound } from "next/navigation";
import { readProject } from "@/lib/storage/projects";
import { readBoard } from "@/lib/storage/boards";
import { listAllSelections } from "@/lib/storage/review";
import { listOriginalScreenshots } from "@/lib/storage/captures";
import { listBackgroundImages } from "@/lib/storage/backgroundImages";
import { listCustomFrames } from "@/lib/storage/customFrames";
import { listBuiltinFrameOverrides } from "@/lib/storage/builtinFrameOverrides";
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
  const originals = await listOriginalScreenshots(id, project.approvedPages);
  const backgroundImages = await listBackgroundImages();
  const customFrames = await listCustomFrames();
  const builtinFrameOverrides = await listBuiltinFrameOverrides();
  const settings = await readSettings();

  return (
    <CanvasEditor
      projectId={id}
      projectName={project.name}
      board={board}
      selections={selections}
      originals={originals}
      pageUrls={Object.fromEntries(project.approvedPages.map((p) => [p.slug, p.url]))}
      backgroundImages={backgroundImages}
      customFrames={customFrames}
      builtinFrameOverrides={builtinFrameOverrides}
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
