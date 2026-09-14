import type { CSSProperties } from "react";
import { CroppedImage } from "./CroppedImage";
import { DEFAULT_CROP } from "@/types/review";
import type { CropSettings } from "@/types/review";

interface DeviceFrameProps {
  variant: "desktop" | "laptop" | "tablet" | "mobile";
  src: string | null;
  width: number;
  crop?: CropSettings;
  style?: CSSProperties;
}

/**
 * Real device-frame PNGs (provided by the user, transparent background, a
 * genuine see-through cutout where the screen goes — verified pixel-for-pixel
 * against each file's alpha channel). `hole` is the screen cutout's bounding
 * box in the source image's own pixel coordinates; `aspect` is the full
 * image's height/width ratio, used to size the frame from just a width.
 */
const FRAME_ASSETS: Record<DeviceFrameProps["variant"], { src: string; imageWidth: number; imageHeight: number; hole: { left: number; top: number; width: number; height: number } }> = {
  desktop: {
    src: "/frames/desktop.png",
    imageWidth: 2560,
    imageHeight: 1940,
    hole: { left: 206, top: 21, width: 2152, height: 1249 },
  },
  laptop: {
    src: "/frames/laptop.png",
    imageWidth: 2940,
    imageHeight: 2043,
    hole: { left: 297, top: 75, width: 2391, height: 1621 },
  },
  tablet: {
    src: "/frames/tablet.png",
    imageWidth: 1797,
    imageHeight: 2231,
    hole: { left: 167, top: 105, width: 1502, height: 1974 },
  },
  mobile: {
    src: "/frames/mobile.png",
    imageWidth: 1292,
    imageHeight: 2301,
    hole: { left: 182, top: 109, width: 968, height: 1999 },
  },
};

/** Outer frame height for a given displayed width, from the source image's own aspect ratio. */
export function frameImageHeight(variant: DeviceFrameProps["variant"], width: number): number {
  const asset = FRAME_ASSETS[variant];
  return Math.round(width * (asset.imageHeight / asset.imageWidth));
}

function ScreenContent({ src, crop, width, height }: { src: string | null; crop: CropSettings; width: number; height: number }) {
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
  return <CroppedImage src={src} crop={crop} width={width} height={height} />;
}

/**
 * A real device frame around a screenshot, using the user-supplied PNG assets
 * in `public/frames/` (transparent background with a true see-through screen
 * cutout). The screenshot is placed behind the frame image, sized/positioned
 * to exactly fill that cutout, so the frame's bezel/stand/notch render on top
 * of it pixel-for-pixel. Renders a neutral placeholder when src is null, so
 * an unfilled slot never breaks the layout.
 */
export function DeviceFrame({ variant, src, width, crop = DEFAULT_CROP, style }: DeviceFrameProps) {
  const asset = FRAME_ASSETS[variant];
  const scale = width / asset.imageWidth;
  const height = Math.round(asset.imageHeight * scale);
  const holeLeft = Math.round(asset.hole.left * scale);
  const holeTop = Math.round(asset.hole.top * scale);
  const holeWidth = Math.round(asset.hole.width * scale);
  const holeHeight = Math.round(asset.hole.height * scale);

  return (
    <div style={{ position: "absolute", width, height, ...style }}>
      <div style={{ position: "absolute", left: holeLeft, top: holeTop, width: holeWidth, height: holeHeight, overflow: "hidden" }}>
        <ScreenContent src={src} crop={crop} width={holeWidth} height={holeHeight} />
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
