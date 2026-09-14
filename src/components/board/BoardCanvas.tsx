import type { CSSProperties, ReactNode } from "react";
import type { BackgroundFit, BoardBackground } from "@/types/board";

// Default/master size, matching Upwork's recommended 4:3 portfolio image
// dimensions (scaled up for export quality). Each board may override this.
export const BOARD_WIDTH = 2000;
export const BOARD_HEIGHT = 1500;

interface BoardCanvasProps {
  children: ReactNode;
  width?: number;
  height?: number;
  background?: BoardBackground;
  backgroundImageUrl?: string | null;
  backgroundFit?: BackgroundFit;
}

// Matches the studio-backdrop photos the user supplied as the reference look
// (docs/mockups-examples/Responsive-Mockup-Blank-Mode.jpg for dark,
// Responsive-Mockup-Scene-01.jpg for light) — sampled from clear background
// pixels in both images (avoiding the mockup devices themselves) via a small
// sharp script, then approximated as a single soft radial gradient each.
const DARK_BACKGROUND =
  "radial-gradient(1800px 1300px at 76% 30%, #7f7f7f 0%, #5c5c5c 40%, #3f3f3f 75%, #333333 100%)";
const LIGHT_BACKGROUND =
  "radial-gradient(1800px 1300px at 32% 18%, #f6ecdc 0%, #e3d6c2 40%, #c2b3a0 75%, #a3937f 100%)";

/**
 * Shared with CanvasEditor's live preview, so the on-canvas view and the
 * actual export never drift apart. `tileScale` (default 1, i.e. the image's
 * own natural pixel size) lets a scaled-down preview shrink the "repeat"
 * tile size proportionally too — otherwise a repeated texture would look
 * artificially zoomed-in at editor scale versus the full-resolution export.
 */
export function backgroundStyleFor(
  background: BoardBackground,
  backgroundImageUrl: string | null | undefined,
  backgroundFit: BackgroundFit,
  imageNaturalSize?: { width: number; height: number },
  tileScale = 1
): CSSProperties {
  if (background === "image" && backgroundImageUrl) {
    if (backgroundFit === "repeat") {
      const backgroundSize = imageNaturalSize
        ? `${Math.max(1, Math.round(imageNaturalSize.width * tileScale))}px ${Math.max(1, Math.round(imageNaturalSize.height * tileScale))}px`
        : "auto";
      return { backgroundImage: `url(${backgroundImageUrl})`, backgroundRepeat: "repeat", backgroundSize };
    }
    if (backgroundFit === "stretch") {
      return { backgroundImage: `url(${backgroundImageUrl})`, backgroundRepeat: "no-repeat", backgroundSize: "100% 100%" };
    }
    // "cover" — fills the canvas without distortion, cropping overflow, same behavior as CroppedImage elsewhere.
    return {
      backgroundImage: `url(${backgroundImageUrl})`,
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  // Falls back to the dark gradient for an "image" background whose file is
  // missing (e.g. deleted from the library) — never a blank/broken canvas.
  return { background: background === "light" ? LIGHT_BACKGROUND : DARK_BACKGROUND };
}

/**
 * The fixed-size export surface (2000x1500 by default; a board may request
 * different dimensions). This element (and only this element) is what
 * Playwright screenshots during export — never the surrounding page chrome.
 */
export function BoardCanvas({
  children,
  width = BOARD_WIDTH,
  height = BOARD_HEIGHT,
  background = "dark",
  backgroundImageUrl,
  backgroundFit = "cover",
}: BoardCanvasProps) {
  return (
    <div
      id="board-canvas"
      data-background={background}
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        ...backgroundStyleFor(background, backgroundImageUrl, backgroundFit),
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {children}
    </div>
  );
}
