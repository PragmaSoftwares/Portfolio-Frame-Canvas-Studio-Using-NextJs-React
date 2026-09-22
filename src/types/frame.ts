/**
 * A point on a custom frame's screen cutout, as a percentage of the
 * uploaded frame image's own width/height (0-1, not pixels) — resolution-
 * independent, and scales cleanly whatever size the frame is displayed at
 * on a canvas (see DEV_GUIDE's custom-frames plan for why).
 */
export interface FrameCorner {
  xPct: number;
  yPct: number;
}

/**
 * The 4 corners of a custom frame's screen cutout, set once via a
 * corner-pin editor when the frame is uploaded. An axis-aligned rectangle
 * (a "flat" frame) and a trapezoid (an "angled"/3D-perspective frame) are
 * both just this same shape — there's no separate flat/angled frame type,
 * only what the 4 points happen to describe.
 */
export interface FrameScreenQuad {
  topLeft: FrameCorner;
  topRight: FrameCorner;
  bottomRight: FrameCorner;
  bottomLeft: FrameCorner;
}

/** One uploaded custom device frame in the global, project-independent library. */
export interface CustomFrame {
  id: string;
  name: string;
  filename: string;
  imageWidth: number;
  imageHeight: number;
  screenQuad: FrameScreenQuad;
  // width / height of the screen quad's own natural rectangle (derived from
  // screenQuad at save time) — used by the review/crop screen as one more
  // aspect-ratio preset, the same way frameHoleAspect() feeds the existing
  // built-in device frame presets.
  suggestedAspect: number;
  createdAt: string;
}
