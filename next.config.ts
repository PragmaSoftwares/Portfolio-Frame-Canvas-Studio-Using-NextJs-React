import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-mode build activity indicator is a fixed-position overlay that would
  // otherwise get baked into board exports captured from the dev server.
  devIndicators: false,
};

export default nextConfig;
