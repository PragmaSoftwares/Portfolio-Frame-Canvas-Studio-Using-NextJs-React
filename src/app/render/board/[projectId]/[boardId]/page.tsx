import { readBoard } from "@/lib/storage/boards";
import { readPageSelections } from "@/lib/storage/review";
import { readBackgroundImage } from "@/lib/storage/backgroundImages";
import { readSettings } from "@/lib/storage/settings";
import { BoardCanvas } from "@/components/board/BoardCanvas";
import { DeviceFrame } from "@/components/board/DeviceFrame";
import { PlainFrame } from "@/components/board/PlainFrame";
import { DEFAULT_CROP } from "@/types/review";
import { defaultContentFit } from "@/lib/board/frameSize";

// Playwright must capture this route in the Node.js runtime, never Edge.
export const runtime = "nodejs";

interface RenderBoardPageProps {
  params: Promise<{ projectId: string; boardId: string }>;
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, fontFamily: "monospace", color: "#b91c1c" }}>{children}</div>;
}

/**
 * Bare render surface for one free-form canvas board. No navigation, no app
 * chrome, no forced text — just whatever framed screenshots were placed on
 * the canvas, exactly where they were placed.
 */
export default async function RenderBoardPage({ params }: RenderBoardPageProps) {
  const { projectId, boardId } = await params;
  const board = await readBoard(projectId, boardId);
  if (!board) {
    return <ErrorMessage>Board &quot;{boardId}&quot; was not found.</ErrorMessage>;
  }
  const settings = await readSettings();

  const backgroundImage = board.backgroundImageId ? await readBackgroundImage(board.backgroundImageId) : null;
  const backgroundImageUrl = backgroundImage ? `/api/media/backgrounds/${backgroundImage.filename}` : null;

  // Resolve each item's image src, grouping lookups by page to avoid re-reading the same file.
  const selectionsByPage = new Map<string, Awaited<ReturnType<typeof readPageSelections>>>();
  async function selectionsFor(pageSlug: string) {
    if (!selectionsByPage.has(pageSlug)) {
      selectionsByPage.set(pageSlug, await readPageSelections(projectId, pageSlug));
    }
    return selectionsByPage.get(pageSlug)!;
  }

  const resolvedItems = await Promise.all(
    board.items.map(async (item) => {
      const selections = await selectionsFor(item.pageSlug);
      const selection = selections.find((s) => s.id === item.selectionId);
      if (!selection) return null;
      return {
        item,
        src: `/api/media/projects/${projectId}/captures/selections/${selection.filename}`,
      };
    })
  );

  return (
    <BoardCanvas
      width={board.canvasWidth}
      height={board.canvasHeight}
      background={board.background}
      backgroundImageUrl={backgroundImageUrl}
      backgroundFit={board.backgroundFit}
      watermarkEnabled={settings.defaultWatermarkVisible}
      watermarkText={settings.defaultWatermarkText}
      watermarkColor={settings.watermarkColor}
      watermarkLineWidth={settings.watermarkLineWidth}
      watermarkFontSize={settings.watermarkFontSize}
      watermarkOpacity={settings.watermarkOpacity}
    >
      {resolvedItems.map((resolved) => {
        if (!resolved) return null;
        const { item, src } = resolved;
        const style = { left: item.x, top: item.y, zIndex: item.zIndex };
        const crop = { ...DEFAULT_CROP, fit: item.contentFit ?? defaultContentFit(item.frame), y: item.contentY ?? 0.5 };
        const contentBackground = item.contentFitColor ?? "#ffffff";

        if (item.frame === "none") {
          return (
            <PlainFrame
              key={item.id}
              src={src}
              crop={crop}
              width={item.width}
              height={item.height}
              contentBackground={contentBackground}
              style={style}
            />
          );
        }
        return (
          <DeviceFrame
            key={item.id}
            variant={item.frame}
            src={src}
            crop={crop}
            width={item.width}
            contentBackground={contentBackground}
            style={style}
          />
        );
      })}
    </BoardCanvas>
  );
}
