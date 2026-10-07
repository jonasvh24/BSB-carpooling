import type { NextConfig } from "next";

const pilot = process.env.PILOT_MODE === "true";
const https = (process.env.AUTH_URL ?? "").startsWith("https://");

// Sent with every response, static files included. The Content-Security-Policy
// needs a per-request nonce and is set in src/proxy.ts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Origin only, and only to HTTPS: enough for the map tile servers' referrer rule,
  // and no path (which can hold a pool or trip id) ever leaves.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Only meaningful over HTTPS (the tunnel or a real host); harmful on plain localhost.
  ...(https ? [{ key: "Strict-Transport-Security", value: "max-age=15552000" }] : []),
];

const nextConfig: NextConfig = {
  // The e2e suite runs a second server in pilot mode from the same checkout.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // The development server prints every request URL and every server-action call
  // with its arguments. In pilot mode those are real addresses and messages, so
  // both are switched off (the runbook recommends a production build anyway).
  ...(pilot ? { logging: { incomingRequests: false, serverFunctions: false } } : {}),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
