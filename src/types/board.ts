import type { CropFit } from "./review";

export type FrameVariant = "desktop" | "laptop" | "tablet" | "mobile" | "none";

export type BoardBackground = "dark" | "light" | "image";

/** How an uploaded background image fills the canvas when it doesn't match the canvas's own aspect ratio. */
export type BackgroundFit = "cover" | "repeat" | "stretch";

/** One placed, framed screenshot on a canvas board. Position/size are in the board's own fixed pixel space. */
export interface CanvasItem {
  id: string;
  pageSlug: string;
  selectionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
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
