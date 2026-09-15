import type { CSSProperties } from "react";
import { CroppedImage } from "./CroppedImage";
import type { CropSettings } from "@/types/review";

// Defaults to "fit" (contain), not DEFAULT_CROP's "fill" — a device frame's
// fixed screen shape almost never matches an arbitrary crop's own aspect
// ratio, and losing content by default would be the wrong call for something
// meant to showcase a deliberately-cropped screenshot. Callers (CanvasEditor)
// pass an explicit per-item fit once the user has a say in it.
const DEFAULT_SCREEN_CROP: CropSettings = { x: 0.5, y: 0.5, zoom: 1, fit: "fit" };

interface DeviceFrameProps {
  variant: "desktop" | "laptop" | "tablet" | "mobile";
  src: string | null;
  width: number;
  crop?: CropSettings;
  /** Letterbox/pillarbox fill color for "fit" mode's gap. Defaults to white. */
  contentBackground?: string;
  style?: CSSProperties;
}

/**
 * Real device-frame PNGs (provided by the user, transparent background, a
 * genuine see-through cutout where the screen goes — verified pixel-for-pixel
 * against each file's alpha channel). `hole` is the screen cutout's bounding
 * box in the source image's own pixel coordinates, found by scanning outward
 * from the image's center along its 4 cardinal axes — accurate for the flat
 * edges, but a rounded-corner screen curves inward *before* reaching that
 * bounding box's own (square) corners. `cornerRadiusFraction`/`insetFraction`
 * (of hole width) shrink the rendered content slightly and round its corners
 * so they always land inside the true curve, never poking past it into the
 * bezel. `imageWidth`/`imageHeight` are the full source image's own pixel
 * size, used to size the frame from just a width.
 */
const FRAME_ASSETS: Record<
  DeviceFrameProps["variant"],
  {
    src: string;
    imageWidth: number;
    imageHeight: number;
    hole: { left: number; top: number; width: number; height: number };
    cornerRadiusFraction: number;
    insetFraction: number;
  }
> = {
  desktop: {
    src: "/frames/desktop.png",
    imageWidth: 2560,
    imageHeight: 1940,
    hole: { left: 206, top: 21, width: 2152, height: 1249 },
    cornerRadiusFraction: 0.015,
    insetFraction: 0.006,
  },
  laptop: {
    src: "/frames/laptop.png",
    imageWidth: 2940,
    imageHeight: 2043,
    hole: { left: 297, top: 75, width: 2391, height: 1621 },
    cornerRadiusFraction: 0.015,
    insetFraction: 0.006,
  },
  tablet: {
    src: "/frames/tablet.png",
    imageWidth: 1797,
    imageHeight: 2231,
    hole: { left: 167, top: 105, width: 1502, height: 1974 },
    cornerRadiusFraction: 0.045,
    insetFraction: 0.012,
  },
  mobile: {
    src: "/frames/mobile.png",
    imageWidth: 1292,
    imageHeight: 2301,
    hole: { left: 182, top: 109, width: 968, height: 1999 },
    cornerRadiusFraction: 0.1,
    insetFraction: 0.018,
  },
};

/** Outer frame height for a given displayed width, from the source image's own aspect ratio. */
export function frameImageHeight(variant: DeviceFrameProps["variant"], width: number): number {
  const asset = FRAME_ASSETS[variant];
  return Math.round(width * (asset.imageHeight / asset.imageWidth));
}

function ScreenContent({
  src,
  crop,
  width,
  height,
  contentBackground,
}: {
  src: string | null;
  crop: CropSettings;
  width: number;
  height: number;
  contentBackground: string;
}) {
  if (!src) {
    return (
      <div
        style={{
          width,
          height,
          background: "rgba(148,163,184,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ color: "rgba(148,163,184,0.6)", fontSize: 14 }}>No screenshot yet</span>
      </div>
    );
  }
  // A real device's screen window almost never matches an arbitrary crop's
  // own aspect ratio exactly, so whichever fit mode leaves a gap ("fit" /
  // contain) gets a background to fill it — white by default (matching the
  // plain page background most captures have), user-configurable otherwise.
  // Harmless for "fill"/"stretch", which always cover the box completely and
  // never show it.
  return (
    <div style={{ width, height, background: contentBackground }}>
      <CroppedImage src={src} crop={crop} width={width} height={height} />
    </div>
  );
}

/**
 * A real device frame around a screenshot, using the user-supplied PNG assets
 * in `public/frames/` (transparent background with a true see-through screen
 * cutout). The screenshot is placed behind the frame image, sized/positioned
 * to exactly fill that cutout, so the frame's bezel/stand/notch render on top
 * of it pixel-for-pixel. Renders a neutral placeholder when src is null, so
 * an unfilled slot never breaks the layout.
 */
export function DeviceFrame({ variant, src, width, crop = DEFAULT_SCREEN_CROP, contentBackground = "#ffffff", style }: DeviceFrameProps) {
  const asset = FRAME_ASSETS[variant];
  const scale = width / asset.imageWidth;
  const height = Math.round(asset.imageHeight * scale);
  const holeLeft = Math.round(asset.hole.left * scale);
  const holeTop = Math.round(asset.hole.top * scale);
  const holeWidth = Math.round(asset.hole.width * scale);
  const holeHeight = Math.round(asset.hole.height * scale);

  // Inset slightly and round the corners so the content's square corners
  // never poke past the screen's real rounded curve (see FRAME_ASSETS doc).
  const inset = Math.max(1, Math.round(holeWidth * asset.insetFraction));
  const cornerRadius = Math.max(1, Math.round(holeWidth * asset.cornerRadiusFraction));
  const contentLeft = holeLeft + inset;
  const contentTop = holeTop + inset;
  const contentWidth = Math.max(1, holeWidth - inset * 2);
  const contentHeight = Math.max(1, holeHeight - inset * 2);

  return (
    <div style={{ position: "absolute", width, height, ...style }}>
      <div
        style={{
          position: "absolute",
          left: contentLeft,
          top: contentTop,
          width: contentWidth,
          height: contentHeight,
          borderRadius: cornerRadius,
          overflow: "hidden",
        }}
      >
        <ScreenContent src={src} crop={crop} width={contentWidth} height={contentHeight} contentBackground={contentBackground} />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.src}
        alt=""
        draggable={false}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      />
    </div>
  );
}
