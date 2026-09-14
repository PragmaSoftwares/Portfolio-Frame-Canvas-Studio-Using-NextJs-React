import { frameImageHeight } from "@/components/board/DeviceFrame";
import type { FrameVariant } from "@/types/board";

/**
 * Outer frame height for a given width, mirroring DeviceFrame's own layout
 * (the real frame PNGs' own aspect ratio for desktop/laptop/tablet/mobile).
 * Used by the canvas editor to seed a sensible default size when an item is
 * dropped, and to lock aspect ratio while resizing — framed items should
 * only ever get wider/narrower proportionally, since a device frame
 * stretched out of proportion looks broken.
 */
export function frameOuterHeight(frame: FrameVariant, width: number): number {
  switch (frame) {
    case "desktop":
    case "laptop":
    case "tablet":
    case "mobile":
      return frameImageHeight(frame, width);
    case "none":
    default:
      return Math.round(width * 0.75); // 4:3 default for a frameless crop
  }
}

/** Sensible default width per frame type when an item is first dropped on the canvas. */
export function defaultFrameWidth(frame: FrameVariant): number {
  switch (frame) {
    case "desktop":
      return 520;
    case "laptop":
      return 480;
    case "tablet":
      return 320;
    case "mobile":
      return 220;
    case "none":
    default:
      return 360;
  }
}

export function defaultFrameForDevice(sourceDevice: "desktop" | "tablet" | "mobile"): FrameVariant {
  return sourceDevice;
}
