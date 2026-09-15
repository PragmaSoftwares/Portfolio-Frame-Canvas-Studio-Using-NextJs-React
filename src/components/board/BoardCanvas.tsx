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
  watermarkEnabled?: boolean;
  watermarkText?: string;
  watermarkColor?: string;
  watermarkLineWidth?: number;
  watermarkFontSize?: number;
  watermarkOpacity?: number;
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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A repeating diagonal "proof" watermark — two crossing diagonal lines plus
 * the watermark text, rotated to follow one of them, tiled edge-to-edge via
 * CSS background-repeat so it covers the whole canvas and can't be cropped
 * or copy-pasted out of a single spot. Built as one SVG tile (not one big
 * SVG covering the whole canvas) so it repeats crisply at any canvas size
 * without regenerating markup per size. Everything about it — color, line
 * width, text size, opacity, whether it shows at all, and what text it
 * says — is agency-wide (AgencySettings), applied identically to every
 * project's boards; there's no per-project override.
 */
export function watermarkStyle(
  text: string,
  color: string,
  lineWidth: number,
  fontSize: number,
  opacity: number,
  tileScale = 1
): CSSProperties {
  // Tile size scales with text length and font size so longer watermark text
  // doesn't get clipped and the repeat spacing stays proportional. `tileScale`
  // (default 1, i.e. full export resolution) shrinks the whole tile — text,
  // lines, and spacing together — for a scaled-down editor preview, the same
  // way backgroundStyleFor's own tileScale does for a repeating background
  // image; otherwise the pattern would look artificially oversized in the
  // editor compared to the real export.
  const scaledFontSize = Math.max(4, fontSize * tileScale);
  const scaledLineWidth = Math.max(0.25, lineWidth * tileScale);
  const tile = Math.max(40, Math.round(scaledFontSize * (text.length * 0.6 + 6)));
  const half = tile / 2;
  const safeText = escapeXml(text);
  // Opacity is a separate multiplier from the color itself (applied to the
  // whole group, not baked into the hex) — a low-opacity, barely-there-
  // unless-you-look-closely watermark (the Canva-style default this is
  // meant to match) is mostly about opacity, not stroke width; keeping it
  // distinct also means the color swatch in Settings still shows the true
  // color at full strength, not something already faded.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}">
    <g opacity="${opacity}">
      <line x1="0" y1="0" x2="${tile}" y2="${tile}" stroke="${color}" stroke-width="${scaledLineWidth}" />
      <line x1="0" y1="${tile}" x2="${tile}" y2="0" stroke="${color}" stroke-width="${scaledLineWidth}" />
      <text x="${half}" y="${half}" fill="${color}" font-size="${scaledFontSize}" font-family="sans-serif" font-weight="600" letter-spacing="1" text-anchor="middle" dominant-baseline="middle" transform="rotate(-45 ${half} ${half})">${safeText}</text>
    </g>
  </svg>`;
  return {
    position: "absolute",
    inset: 0,
    // Placed items carry their own explicit z-index (CanvasItem.zIndex), and
    // any sibling with a positive z-index stacks above one left at the
    // default "auto" regardless of DOM order — so without an explicit,
    // deliberately-huge z-index here, the watermark would end up buried
    // under items instead of sitting on top of all of them as a watermark
    // needs to (unremovable by just moving/layering items around it).
    zIndex: 999_999,
    pointerEvents: "none",
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundRepeat: "repeat",
    backgroundSize: `${tile}px ${tile}px`,
  };
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
  watermarkEnabled = false,
  watermarkText = "SAMPLE",
  watermarkColor = "#94a3b8",
  watermarkLineWidth = 0.75,
  watermarkFontSize = 14,
  watermarkOpacity = 0.18,
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
      {/* Rendered after children (and unclickable) so it always sits on top of
          every placed item, the way a proof watermark needs to — otherwise a
          framed screenshot could just cover it up. */}
      {watermarkEnabled && watermarkText.trim().length > 0 && (
        <div style={watermarkStyle(watermarkText, watermarkColor, watermarkLineWidth, watermarkFontSize, watermarkOpacity)} />
      )}
    </div>
  );
}
