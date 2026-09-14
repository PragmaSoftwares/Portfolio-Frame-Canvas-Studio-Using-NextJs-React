import { getBrowser } from "@/lib/capture/browser";
import { BOARD_WIDTH, BOARD_HEIGHT } from "@/components/board/BoardCanvas";

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportError";
  }
}

const NAVIGATION_TIMEOUT_MS = 30_000;

export interface ExportDimensions {
  width: number;
  height: number;
}

/**
 * Renders /render/[projectId]/[templateId] in a real browser and screenshots
 * only the #board-canvas element, producing an exact width x height PNG.
 * Defaults to the 2000x1500 master size; pass a template's own dimensions
 * (e.g. Case Study's portrait canvas) to verify against those instead.
 */
export async function exportBoardToPng(
  renderUrl: string,
  dimensions: ExportDimensions = { width: BOARD_WIDTH, height: BOARD_HEIGHT }
): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: dimensions,
    deviceScaleFactor: 1,
  });

  try {
    const page = await context.newPage();
    await page.goto(renderUrl, { waitUntil: "networkidle", timeout: NAVIGATION_TIMEOUT_MS });

    const board = page.locator("#board-canvas");
    const boardExists = (await board.count()) > 0;
    if (!boardExists) {
      throw new ExportError("The board could not be rendered. The capture may not be ready.");
    }

    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() =>
      Promise.all(
        Array.from(document.images).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              })
        )
      )
    );

    const box = await board.boundingBox();
    if (!box || Math.round(box.width) !== dimensions.width || Math.round(box.height) !== dimensions.height) {
      throw new ExportError(
        `Board rendered at an unexpected size (${box ? `${box.width}x${box.height}` : "not found"}), expected ${dimensions.width}x${dimensions.height}.`
      );
    }

    return await board.screenshot({ type: "png" });
  } finally {
    await context.close();
  }
}
