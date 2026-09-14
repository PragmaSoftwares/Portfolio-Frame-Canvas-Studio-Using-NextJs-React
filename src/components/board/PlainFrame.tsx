import type { CSSProperties } from "react";
import { CroppedImage } from "./CroppedImage";
import { DEFAULT_CROP } from "@/types/review";
import type { CropSettings } from "@/types/review";

interface PlainFrameProps {
  src: string | null;
  crop?: CropSettings;
  width: number;
  height: number;
  placeholderLabel?: string;
  style?: CSSProperties;
}

/**
 * A minimal rounded-corner, shadowed frame for slots that hold an arbitrary
 * cropped section rather than a specific device's full screenshot (no browser
 * chrome or phone bezel). Renders a neutral empty state when no image is
 * assigned yet, so a template never breaks when optional slots are unfilled.
 */
export function PlainFrame({ src, crop = DEFAULT_CROP, width, height, placeholderLabel, style }: PlainFrameProps) {
  const frameStyle: CSSProperties = {
    position: "absolute",
    width,
    height,
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 30px 60px -20px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
    ...style,
  };

  if (!src) {
    return (
      <div
        style={{
          ...frameStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(148,163,184,0.12)",
          border: "1px dashed rgba(148,163,184,0.35)",
        }}
      >
        {placeholderLabel && (
          <span style={{ color: "rgba(148,163,184,0.7)", fontSize: 16, textAlign: "center", padding: 16 }}>
            {placeholderLabel}
          </span>
        )}
      </div>
    );
  }

  return <CroppedImage src={src} crop={crop} width={width} height={height} style={frameStyle} />;
}
