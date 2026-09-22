import { notFound } from "next/navigation";
import { readProject } from "@/lib/storage/projects";
import { draftBoard } from "@/lib/storage/boards";
import { listAllSelections } from "@/lib/storage/review";
import { listBackgroundImages } from "@/lib/storage/backgroundImages";
import { listCustomFrames } from "@/lib/storage/customFrames";
import { listBuiltinFrameOverrides } from "@/lib/storage/builtinFrameOverrides";
import { readSettings } from "@/lib/storage/settings";
import { CanvasEditor } from "@/components/canvas/CanvasEditor";

// A literal segment ("new") alongside the [boardId] dynamic route — Next.js
// resolves the exact match here rather than treating "new" as a boardId.
// Reads live data straight off disk the same way the Dashboard/Settings did
// before that bug fix, so it needs the same guard: without this, it'd get
// statically prerendered once at build time and never reflect a project's
// actual current state again in production.
export const dynamic = "force-dynamic";

interface NewBoardPageProps {
  params: Promise<{ id: string }>;
}

export default async function NewBoardPage({ params }: NewBoardPageProps) {
  const { id } = await params;
  const project = await readProject(id);
  if (!project) notFound();

  const board = await draftBoard(id);
  const selections = await listAllSelections(id, project.approvedPages);
  const backgroundImages = await listBackgroundImages();
  const customFrames = await listCustomFrames();
  const builtinFrameOverrides = await listBuiltinFrameOverrides();
  const settings = await readSettings();

  return (
    <CanvasEditor
      projectId={id}
      projectName={project.name}
      board={board}
      isNewBoard
      selections={selections}
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
