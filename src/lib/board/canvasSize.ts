// Per-side limits for a board's canvas, in px. Export launches a real browser
// at the board's exact size (times EXPORT_SCALE_FACTOR), so the upper bound
// keeps memory use sane.
export const MIN_CANVAS_SIZE = 200;
export const MAX_CANVAS_SIZE = 4000;

export interface AspectPreset {
  label: string;
  w: number;
  h: number;
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { label: "4:3", w: 4, h: 3 },
  { label: "3:4", w: 3, h: 4 },
  { label: "1:1", w: 1, h: 1 },
  { label: "16:9", w: 16, h: 9 },
  { label: "9:16", w: 9, h: 16 },
  { label: "4:5", w: 4, h: 5 },
  { label: "6:7", w: 6, h: 7 },
];

export function clampCanvasSize(n: number): number {
  return Math.min(MAX_CANVAS_SIZE, Math.max(MIN_CANVAS_SIZE, Math.round(n)));
}

// Which preset (if any) the given size exactly matches, by cross-multiplying
// so there's no float comparison.
export function matchingPreset(width: number, height: number): AspectPreset | null {
  return ASPECT_PRESETS.find((p) => width * p.h === height * p.w) ?? null;
}

// Keeps the width and derives the height from the preset's ratio. If that
// height would exceed the limits, the height is clamped instead of changing
// the user's width.
export function heightForPreset(width: number, preset: AspectPreset): number {
  return clampCanvasSize((width * preset.h) / preset.w);
}
