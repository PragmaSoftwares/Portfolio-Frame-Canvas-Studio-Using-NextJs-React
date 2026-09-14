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
