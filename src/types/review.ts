import type { CaptureDevice } from "@/lib/storage/paths";

// Display-time fit for an already-cropped image inside its board frame — no
// adjustable position/zoom anymore (that precision now happens once, physically,
// via the crop tool). Kept so BoardCanvas/DeviceFrame/CroppedImage don't need
// reshaping: it's effectively always DEFAULT_CROP now.
export type CropFit = "fit" | "fill";

export interface CropSettings {
  x: number;
  y: number;
  zoom: number;
  fit: CropFit;
}

export const DEFAULT_CROP: CropSettings = { x: 0.5, y: 0.5, zoom: 1, fit: "fill" };

export interface CropRect {
  x: number; // px, in the source (full-page) image's natural pixel coordinates
  y: number;
  width: number;
  height: number;
}

/**
 * One manually-cropped section of a page, saved as its own derivative PNG.
 * The source full-page capture is never modified — this is always a new file.
 */
export interface ScreenshotSelection {
  id: string;
  pageSlug: string;
  label: string;
  sourceDevice: CaptureDevice;
  cropRect: CropRect;
  filename: string; // within captures/selections/
  width: number; // derivative image pixel width
  height: number; // derivative image pixel height
  createdAt: string;
}
