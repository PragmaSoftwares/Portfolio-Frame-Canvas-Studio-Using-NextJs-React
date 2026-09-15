import type { CSSProperties } from "react";
import type { CropSettings } from "@/types/review";

interface CroppedImageProps {
  src: string;
  crop: CropSettings;
  width: number | string;
  height: number | string;
  style?: CSSProperties;
}

/**
 * Renders an image with position/zoom/fit ("fit"/"fill"/"stretch") crop
 * settings applied purely via CSS — the underlying file is never modified.
 * Shared by the board (preview and export) and the screenshot review card,
 * so crop always looks identical everywhere it's shown.
 */
export function CroppedImage({ src, crop, width, height, style }: CroppedImageProps) {
  return (
    <div style={{ position: "relative", overflow: "hidden", width, height, ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: crop.fit === "fit" ? "contain" : crop.fit === "stretch" ? "fill" : "cover",
          objectPosition: `${crop.x * 100}% ${crop.y * 100}%`,
          transform: `scale(${crop.zoom})`,
          transformOrigin: `${crop.x * 100}% ${crop.y * 100}%`,
          userSelect: "none",
          WebkitUserDrag: "none",
        } as CSSProperties}
      />
    </div>
  );
}
