import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The e2e suite runs a second server in pilot mode from the same checkout.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
