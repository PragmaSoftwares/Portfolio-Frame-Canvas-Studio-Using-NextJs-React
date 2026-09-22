import type { CSSProperties } from "react";
import { CroppedImage } from "./CroppedImage";
import { matrix3dForQuad, type Quad, type Point } from "@/lib/canvas/homography";
import { DEFAULT_CROP } from "@/types/review";
import type { CropSettings } from "@/types/review";
import type { CustomFrame } from "@/types/frame";

interface CustomDeviceFrameProps {
  frame: CustomFrame;
  frameSrc: string;
  src: string | null;
  width: number;
  crop?: CropSettings;
  contentBackground?: string;
  // A real screen almost always has rounded corners, but the frame's
  // screenQuad (see types/frame.ts) is a straight-edged quadrilateral, so
  // the screenshot's square corners can poke past the true curve even when
  // the quad was placed accurately. Rounding the screenshot's own corners
  // (0-1, a fraction of its shorter side) tucks them back inside. Set per
  // board item, not on the frame itself — see ScreenshotItem.cornerRadiusPct.
  cornerRadiusPct?: number;
  style?: CSSProperties;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
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
  return (
    <div style={{ width, height, borderRadius, overflow: "hidden", background: contentBackground }}>
      <CroppedImage src={src} crop={crop} width={width} height={height} />
    </div>
  );
}

/**
 * A user-uploaded custom device frame around a screenshot. Unlike the
 * built-in frames (a plain axis-aligned rectangle cutout, see
 * DeviceFrame.tsx), a custom frame's screen area is an arbitrary
 * quadrilateral (see types/frame.ts) — a flat rectangle happens to be one
 * for an ordinary frame, a trapezoid for one photographed/rendered at a 3D
 * angle. Both are handled by the exact same code path: the screenshot is
 * rendered into a plain flat rectangle, then CSS `matrix3d()`-warped
 * (see lib/canvas/homography.ts) so its 4 corners land exactly on the
 * frame's stored quad corners, with the frame's own PNG layered on top.
 */
export function CustomDeviceFrame({
  frame,
  frameSrc,
  src,
  width,
  crop = DEFAULT_CROP,
  contentBackground = "#ffffff",
  cornerRadiusPct = 0,
  style,
}: CustomDeviceFrameProps) {
  const scale = width / frame.imageWidth;
  const height = Math.round(frame.imageHeight * scale);

  const destination: Quad = {
    topLeft: { x: frame.screenQuad.topLeft.xPct * width, y: frame.screenQuad.topLeft.yPct * height },
    topRight: { x: frame.screenQuad.topRight.xPct * width, y: frame.screenQuad.topRight.yPct * height },
    bottomRight: { x: frame.screenQuad.bottomRight.xPct * width, y: frame.screenQuad.bottomRight.yPct * height },
    bottomLeft: { x: frame.screenQuad.bottomLeft.xPct * width, y: frame.screenQuad.bottomLeft.yPct * height },
  };

  // The flat (undistorted) rectangle that gets warped — sized to match the
  // destination quad's own on-screen dimensions (average of its two width
  // edges/two height edges), so the warp neither loses resolution (source
  // too small) nor wastes it (source far larger than what's ever shown).
  const flatWidth = Math.max(1, Math.round((distance(destination.topLeft, destination.topRight) + distance(destination.bottomLeft, destination.bottomRight)) / 2));
  const flatHeight = Math.max(1, Math.round((distance(destination.topLeft, destination.bottomLeft) + distance(destination.topRight, destination.bottomRight)) / 2));
  const borderRadius = cornerRadiusPct * Math.min(flatWidth, flatHeight);

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
        src={frameSrc}
        alt=""
        draggable={false}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      />
    </div>
  );
}
