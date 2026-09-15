import type { CropFit } from "./review";

export type FrameVariant = "desktop" | "laptop" | "tablet" | "mobile" | "none";

export type BoardBackground = "dark" | "light" | "image";

/** How an uploaded background image fills the canvas when it doesn't match the canvas's own aspect ratio. */
export type BackgroundFit = "cover" | "repeat" | "stretch";

export type TextAlign = "left" | "center" | "right" | "justify";
export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize";
export type VerticalAlign = "top" | "middle" | "bottom";

/** Fields shared by every kind of thing placeable on a board — position/size/layer, in the board's own fixed pixel space. */
interface CanvasItemBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

/** One placed, framed screenshot on a canvas board. */
export interface ScreenshotItem extends CanvasItemBase {
  kind: "screenshot";
  pageSlug: string;
  selectionId: string;
  frame: FrameVariant;
  // How the screenshot fills its frame/box — "fit" (show everything, may
  // letterbox), "fill" (crop overflow), or "stretch" (fill exactly, may
  // distort). Defaults to "fit" for a device frame, "fill" for "none",
  // applied when the item is created or its frame changes — see
  // CanvasEditor's addItem/changeFrame.
  contentFit?: CropFit;
  // Fill color for the letterbox/pillarbox gap "fit" can leave around the
  // image (a hex string, e.g. "#ffffff"). Only visible when contentFit is
  // "fit" and the crop's own aspect ratio doesn't exactly match the box.
  contentFitColor?: string;
  // Vertical anchor (0 = top, 1 = bottom, default 0.5 = centered) for
  // whichever part of the screenshot stays visible when its aspect ratio
  // doesn't match the box — which part gets cropped under "fill", or which
  // side the leftover letterbox space favors under "fit". Meaningless for
  // "stretch" (always fills exactly, no offset possible). Set via the
  // sidebar's vertical-position drag handle in CanvasEditor.
  contentY?: number;
}

/** One placed, freely-styled text box on a canvas board. */
export interface TextItem extends CanvasItemBase {
  kind: "text";
  text: string;
  // One of lib/fonts.ts's FONT_FAMILY_NAMES — kept as a plain string (not a
  // union) so an older saved item still renders sensibly even if the
  // curated font list ever changes; see cssFontFamily's fallback.
  fontFamily: string;
  fontSize: number; // px, at full export resolution — same convention as width/height
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string; // hex
  align: TextAlign;
  letterSpacing: number; // px
  lineHeight: number; // unitless multiplier, e.g. 1.2
  textTransform: TextTransform;
  // Where the text sits within its own box when the box is taller than the
  // text needs — meaningless once the text itself overflows the box, same
  // as contentY is meaningless for a "stretch" screenshot.
  verticalAlign: VerticalAlign;
  // A plate behind the text spanning the whole box (not just tight around
  // each line) — undefined/absent means no plate at all, not "transparent
  // stored as a color". Alpha isn't expressible via <input type=color>, so
  // fading it uses the separate `opacity` field instead.
  backgroundColor?: string; // hex
  opacity: number; // 0-1, applied to the whole item (text + background plate together)
  // Drop shadow behind the text — undefined/absent means no shadow at all,
  // same "absence, not a stored transparent value" convention as
  // backgroundColor above.
  textShadowColor?: string; // hex
  textShadowBlur: number; // px
  textShadowOffsetX: number; // px
  textShadowOffsetY: number; // px
  // An outline around each glyph, via -webkit-text-stroke — well supported
  // in the Chromium this app both previews in (during development) and
  // exports through (Playwright), which is the only rendering target that
  // actually matters here. Same undefined-means-off convention.
  textStrokeColor?: string; // hex
  textStrokeWidth: number; // px
}

export type CanvasItem = ScreenshotItem | TextItem;

export interface Board {
  id: string;
  projectId: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  background: BoardBackground;
  // Only meaningful when background === "image".
  backgroundImageId?: string;
  backgroundFit?: BackgroundFit;
  items: CanvasItem[];
  createdAt: string;
  updatedAt: string;
}
