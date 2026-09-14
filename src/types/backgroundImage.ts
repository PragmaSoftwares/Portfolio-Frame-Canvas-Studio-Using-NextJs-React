import type { BackgroundFit, BoardBackground } from "./board";

/** One uploaded background image in the global, project-independent library. */
export interface BackgroundImage {
  id: string;
  filename: string;
  originalName: string;
  width: number;
  height: number;
  createdAt: string;
}

/**
 * The background choice most recently saved on any board, across every
 * project — new boards default to this instead of always starting dark, so
 * an uploaded background doesn't need to be re-picked (or re-uploaded) for
 * the next canvas.
 */
export interface LastUsedBackground {
  background: BoardBackground;
  backgroundImageId?: string;
  backgroundFit?: BackgroundFit;
}
