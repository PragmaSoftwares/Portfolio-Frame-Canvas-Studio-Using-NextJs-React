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
