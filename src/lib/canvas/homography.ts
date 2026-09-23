// A layer with a CSS `matrix3d()` transform gets rasterized by the browser's
// compositor into its own texture, at a resolution that isn't reliably tied
// 1:1 to the layer's final on-screen size — confirmed live: content sized to
// exactly match its destination quad (no nominal scaling at all) still came
// out visibly softer through a matrix3d-transformed layer than the same
// content rendered directly, even at a high overall page deviceScaleFactor
// (see lib/export/exportBoard.ts). Authoring the pre-warp content at this
// many times its true on-screen size (the matrix bakes in a compensating
// shrink automatically — see matrix3dForQuad below) gives the compositor
// more source detail than it needs, so whatever softening its rasterization
// introduces lands well below what's visible in the final export. Used by
// both DeviceFrame.tsx (built-in frames) and CustomDeviceFrame.tsx.
export const CONTENT_SUPERSAMPLE = 2;

export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

// Cofactor/adjugate of a 3x3 matrix (row-major, 9 entries) — used in place
// of a full inverse below. A homography matrix is only defined up to an
// overall nonzero scalar multiple (CSS matrix3d's perspective divide makes
// any uniform scaling of the whole matrix cancel out), and
// adjugate(m) == det(m) * inverse(m), so using the adjugate directly skips
// a division by the determinant for free without changing the transform.
function adjugate(m: number[]): number[] {
  return [
    m[4] * m[8] - m[5] * m[7],
    m[2] * m[7] - m[1] * m[8],
    m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8],
    m[0] * m[8] - m[2] * m[6],
    m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6],
    m[1] * m[6] - m[0] * m[7],
    m[0] * m[4] - m[1] * m[3],
  ];
}

function multiplyMatrices(a: number[], b: number[]): number[] {
  const c = new Array<number>(9);
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) sum += a[3 * i + k] * b[3 * k + j];
      c[3 * i + j] = sum;
    }
  }
  return c;
}

function multiplyMatrixVector(m: number[], v: number[]): number[] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

// The projective transform mapping the unit square's 4 corners — (0,0),
// (1,0), (1,1), (0,1) — onto 4 arbitrary given points, in that same order.
function squareToQuad(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): number[] {
  const m = [x1, x2, x3, y1, y2, y3, 1, 1, 1];
  const v = multiplyMatrixVector(adjugate(m), [x4, y4, 1]);
  return multiplyMatrices(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

/**
 * A 2D projective transform (a "homography") mapping a `sourceWidth` x
 * `sourceHeight` rectangle's 4 corners — (0,0), (w,0), (w,h), (0,h) — onto
 * an arbitrary destination quadrilateral, as a CSS `matrix3d(...)` value.
 *
 * Standard technique: map the unit square onto the source rectangle and
 * onto the destination quad separately, then compose
 * `destination * inverse(source)` — this is the well-known "4-point to
 * 4-point" homography used to fake perspective with CSS (equivalent to
 * what `getPerspectiveTransform` computes in OpenCV/Photoshop-style corner
 * pinning). Expressed directly as a 4x4 CSS matrix so the projective divide
 * is baked into the matrix itself — no `perspective` CSS property needed on
 * an ancestor, and no canvas-pixel warping. The browser (both live and via
 * Playwright's screenshot at export time) renders the actual perspective-
 * correct interpolation natively. See docs/CUSTOM_FRAMES_PLAN.md.
 */
export function matrix3dForQuad(sourceWidth: number, sourceHeight: number, destination: Quad): string {
  const source = squareToQuad(0, 0, sourceWidth, 0, sourceWidth, sourceHeight, 0, sourceHeight);
  const dest = squareToQuad(
    destination.topLeft.x,
    destination.topLeft.y,
    destination.topRight.x,
    destination.topRight.y,
    destination.bottomRight.x,
    destination.bottomRight.y,
    destination.bottomLeft.x,
    destination.bottomLeft.y
  );
  const rawT = multiplyMatrices(dest, adjugate(source));

  // `rawT` is only correct up to an arbitrary nonzero scalar multiple (a
  // homography has 8 degrees of freedom despite 9 matrix entries — CSS's
  // own perspective divide by the w-component cancels any uniform scale).
  // Composing two adjugates instead of true inverses (see adjugate's own
  // comment) means that scalar can end up astronomically large or small
  // depending on the specific input geometry — confirmed live: one set of
  // real on-canvas coordinates produced coefficients around 1e19, which
  // still divided out to mathematically correct on-screen positions in
  // plain JS, but is far outside what a browser's GPU compositor can carry
  // through at float32 precision without visibly breaking the render.
  // Dividing every entry by the largest-magnitude one brings coefficients
  // back to a sane ~1-ish range without changing the transform at all.
  //
  // The *sign* of that divisor matters too, separately from magnitude — and
  // this part isn't just a precision nicety. Unlike a plain 2D homography
  // (where numerator and denominator negate together and the ratio, i.e.
  // the actual on-screen point, is identical either way), CSS interprets
  // matrix3d as a real 3D transform with a camera model: t[8] becomes the
  // constant term of the W component, and CSS treats negative W as "behind
  // the camera" and simply doesn't paint it — even though the 2D math is
  // still perfectly correct. Confirmed live: a transform that mapped every
  // corner correctly (verified in plain JS) rendered as fully invisible in
  // a real browser until forcing t[8]'s sign positive here. So the
  // normalization divisor's sign is chosen to make t[8] end up positive,
  // not just its magnitude reduced.
  const largestEntry = rawT.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), rawT[0]);
  const divisor = rawT[8] < 0 ? -Math.abs(largestEntry) : Math.abs(largestEntry);
  const t = divisor !== 0 ? rawT.map((v) => v / divisor) : rawT;

  // Row-major 3x3 t -> CSS matrix3d's column-major 16-value form (the 3rd
  // row/column, the unused Z axis, is always [0,0,1,0] filler for a 2D
  // transform).
  const values = [
    t[0], t[3], 0, t[6],
    t[1], t[4], 0, t[7],
    0, 0, 1, 0,
    t[2], t[5], 0, t[8],
  ];
  return `matrix3d(${values.join(",")})`;
}
