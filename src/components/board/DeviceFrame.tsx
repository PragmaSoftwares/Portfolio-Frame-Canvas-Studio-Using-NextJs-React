import type { CSSProperties } from "react";
import { CroppedImage } from "./CroppedImage";
import { matrix3dForQuad, type Quad, type Point } from "@/lib/canvas/homography";
import type { CropSettings } from "@/types/review";
import type { FrameScreenQuad } from "@/types/frame";
import type { BuiltinFrameVariant } from "@/types/board";

// Defaults to "fit" (contain), not DEFAULT_CROP's "fill" — a device frame's
// fixed screen shape almost never matches an arbitrary crop's own aspect
// ratio, and losing content by default would be the wrong call for something
// meant to showcase a deliberately-cropped screenshot. Callers (CanvasEditor)
// pass an explicit per-item fit once the user has a say in it.
const DEFAULT_SCREEN_CROP: CropSettings = { x: 0.5, y: 0.5, zoom: 1, fit: "fit" };

interface DeviceFrameProps {
  variant: BuiltinFrameVariant;
  src: string | null;
  width: number;
  crop?: CropSettings;
  /** Letterbox/pillarbox fill color for "fit" mode's gap. Defaults to white. */
  contentBackground?: string;
  // Overrides this variant's own tuned FRAME_ASSETS corner radius (0-1, a
  // fraction of the screen hole's width) — undefined/omitted keeps that
  // built-in default, matching every item placed before this was
  // user-adjustable. See ScreenshotItem.cornerRadiusPct.
  cornerRadiusPct?: number;
  // A user-corrected screen quad for this variant (see
  // lib/storage/builtinFrameOverrides.ts and defaultScreenQuad below) —
  // undefined/omitted falls back to this variant's own built-in default,
  // derived from FRAME_ASSETS' `hole` rect.
  screenQuadOverride?: FrameScreenQuad;
  style?: CSSProperties;
}

/**
 * Real device-frame PNGs (provided by the user, transparent background, a
 * genuine see-through cutout where the screen goes). `screenQuad` is the
 * screen cutout's 4 corners as fractions of the source image's own
 * width/height — the default quad used until a user correction is saved
 * (see lib/storage/builtinFrameOverrides.ts), hand-corrected once via the
 * same corner-pin editor custom frames use, then baked in here as the new
 * default. `imageWidth`/`imageHeight` are the full source image's own
 * pixel size, used to size the frame from just a width.
 */
const FRAME_ASSETS: Record<
  BuiltinFrameVariant,
  {
    src: string;
    imageWidth: number;
    imageHeight: number;
    screenQuad: FrameScreenQuad;
    cornerRadiusFraction: number;
  }
> = {
  desktop: {
    src: "/frames/desktop.png",
    imageWidth: 2560,
    imageHeight: 1940,
    screenQuad: {
      topLeft: { xPct: 0.07833340962727865, yPct: 0.009340684492509443 },
      topRight: { xPct: 0.92109375, yPct: 0.010824742268041237 },
      bottomRight: { xPct: 0.92109375, yPct: 0.654639175257732 },
      bottomLeft: { xPct: 0.08046875, yPct: 0.654639175257732 },
    },
    cornerRadiusFraction: 0.015,
  },
  laptop: {
    src: "/frames/laptop.png",
    imageWidth: 2940,
    imageHeight: 2043,
    screenQuad: {
      topLeft: { xPct: 0.10102040816326531, yPct: 0.03671071953010279 },
      topRight: { xPct: 0.9142857142857143, yPct: 0.03671071953010279 },
      bottomRight: { xPct: 0.9142857142857143, yPct: 0.8301517376407245 },
      bottomLeft: { xPct: 0.10166664123535156, yPct: 0.8299401563084768 },
    },
    cornerRadiusFraction: 0.015,
  },
  tablet: {
    src: "/frames/tablet.png",
    imageWidth: 1797,
    imageHeight: 2231,
    screenQuad: {
      topLeft: { xPct: 0.09293266555370061, yPct: 0.047064096817570594 },
      topRight: { xPct: 0.9287701725097385, yPct: 0.047064096817570594 },
      bottomRight: { xPct: 0.9287701725097385, yPct: 0.9318691169878978 },
      bottomLeft: { xPct: 0.09293266555370061, yPct: 0.9318691169878978 },
    },
    cornerRadiusFraction: 0.045,
  },
  mobile: {
    src: "/frames/mobile.png",
    imageWidth: 1292,
    imageHeight: 2301,
    screenQuad: {
      topLeft: { xPct: 0.1372882390426377, yPct: 0.046190497988746276 },
      topRight: { xPct: 0.8966103246656515, yPct: 0.044285728817894346 },
      bottomRight: { xPct: 0.9033898822331833, yPct: 0.9185713995070685 },
      bottomLeft: { xPct: 0.1305084228515625, yPct: 0.9204762776692709 },
    },
    cornerRadiusFraction: 0.1,
  },
};

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Outer frame height for a given displayed width, from the source image's own aspect ratio. */
export function frameImageHeight(variant: BuiltinFrameVariant, width: number): number {
  const asset = FRAME_ASSETS[variant];
  return Math.round(width * (asset.imageHeight / asset.imageWidth));
}

/**
 * The real screen cutout's own aspect ratio (width/height) — the single
 * source of truth for "what aspect ratio should a screenshot be to fill
 * this frame without letterboxing." Used by the review screen's
 * crop-aspect presets so they match the frames a screenshot will actually
 * end up in, instead of a hand-picked guess. Average of the quad's two
 * width edges / two height edges, same approach as a custom frame's own
 * suggestedAspect (see lib/storage/customFrames.ts).
 */
export function frameHoleAspect(variant: BuiltinFrameVariant): number {
  const { screenQuad } = FRAME_ASSETS[variant];
  const dist = (a: { xPct: number; yPct: number }, b: { xPct: number; yPct: number }) => Math.hypot(b.xPct - a.xPct, b.yPct - a.yPct);
  const width = (dist(screenQuad.topLeft, screenQuad.topRight) + dist(screenQuad.bottomLeft, screenQuad.bottomRight)) / 2;
  const height = (dist(screenQuad.topLeft, screenQuad.bottomLeft) + dist(screenQuad.topRight, screenQuad.bottomRight)) / 2;
  return width / height;
}

/** This variant's own tuned default corner radius (0-1, fraction of the screen hole's width) — the value used when an item's `cornerRadiusPct` is unset. */
export function defaultCornerRadiusFraction(variant: BuiltinFrameVariant): number {
  return FRAME_ASSETS[variant].cornerRadiusFraction;
}

/** This variant's source PNG and its natural pixel size — used by the "Edit corners" flow to open the corner-pin editor on a built-in frame the same way it opens on a custom one. */
export function builtinFrameImageInfo(variant: BuiltinFrameVariant): { src: string; imageWidth: number; imageHeight: number } {
  const { src, imageWidth, imageHeight } = FRAME_ASSETS[variant];
  return { src, imageWidth, imageHeight };
}

/** This variant's built-in default screen quad — the corner-pin editor's starting point when no correction has been saved yet. */
export function defaultScreenQuad(variant: BuiltinFrameVariant): FrameScreenQuad {
  return FRAME_ASSETS[variant].screenQuad;
}

function ScreenContent({
  src,
  crop,
  width,
  height,
  contentBackground,
  borderRadius,
}: {
  src: string | null;
  crop: CropSettings;
  width: number;
  height: number;
  contentBackground: string;
  borderRadius: number;
}) {
  if (!src) {
    return (
      <div
        style={{
          width,
          height,
          borderRadius,
          overflow: "hidden",
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
    <div style={{ width, height, borderRadius, overflow: "hidden", background: contentBackground }}>
      <CroppedImage src={src} crop={crop} width={width} height={height} />
    </div>
  );
}

/**
 * A real device frame around a screenshot, using the user-supplied PNG assets
 * in `public/frames/` (transparent background with a true see-through screen
 * cutout). Renders through the exact same screen-quad + CSS `matrix3d()` warp
 * as CustomDeviceFrame.tsx — a plain axis-aligned quad (today's default for
 * all 4 variants) warps to itself pixel-for-pixel, so this is visually
 * identical to the old bespoke-positioning approach for anyone who's never
 * corrected a frame's corners, while letting a corrected (or slightly
 * skewed) quad render exactly as accurately as a custom frame's. Renders a
 * neutral placeholder when src is null, so an unfilled slot never breaks
 * the layout.
 */
export function DeviceFrame({
  variant,
  src,
  width,
  crop = DEFAULT_SCREEN_CROP,
  contentBackground = "#ffffff",
  cornerRadiusPct,
  screenQuadOverride,
  style,
}: DeviceFrameProps) {
  const asset = FRAME_ASSETS[variant];
  const scale = width / asset.imageWidth;
  const height = Math.round(asset.imageHeight * scale);

  const quad = screenQuadOverride ?? defaultScreenQuad(variant);
  const destination: Quad = {
    topLeft: { x: quad.topLeft.xPct * width, y: quad.topLeft.yPct * height },
    topRight: { x: quad.topRight.xPct * width, y: quad.topRight.yPct * height },
    bottomRight: { x: quad.bottomRight.xPct * width, y: quad.bottomRight.yPct * height },
    bottomLeft: { x: quad.bottomLeft.xPct * width, y: quad.bottomLeft.yPct * height },
  };

  // Same averaging approach as CustomDeviceFrame — see its own comment.
  const flatWidth = Math.max(1, Math.round((distance(destination.topLeft, destination.topRight) + distance(destination.bottomLeft, destination.bottomRight)) / 2));
  const flatHeight = Math.max(1, Math.round((distance(destination.topLeft, destination.bottomLeft) + distance(destination.topRight, destination.bottomRight)) / 2));
  const borderRadius = (cornerRadiusPct ?? asset.cornerRadiusFraction) * Math.min(flatWidth, flatHeight);

  return (
    <div style={{ position: "absolute", width, height, ...style }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: flatWidth,
          height: flatHeight,
          transformOrigin: "0 0",
          transform: matrix3dForQuad(flatWidth, flatHeight, destination),
        }}
      >
        <ScreenContent src={src} crop={crop} width={flatWidth} height={flatHeight} contentBackground={contentBackground} borderRadius={borderRadius} />
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
