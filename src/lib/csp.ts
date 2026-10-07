// Content-Security-Policy for every page. Scripts need the per-request nonce
// (Next.js adds it to its own scripts when it sees the header on the request).
// Styles allow inline because React style attributes and Leaflet markers use
// them; that is the one relaxation. Nothing may be loaded from another origin
// except map tiles, and the app cannot be framed.
export function buildCsp(opts: { nonce: string; dev: boolean; tileUrl: string; https: boolean }): string {
  let tileOrigin = "https://tile.openstreetmap.org";
  try {
    // Tile URLs are templates such as https://{s}.example.org/{z}/{x}/{y}.png.
    const u = new URL(opts.tileUrl.replace("{s}", "*").replace(/\{[zxyr]\}/g, "0"));
    tileOrigin = `${u.protocol}//${u.host}`;
  } catch {}
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${opts.nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${tileOrigin}`,
    `font-src 'self'`,
    `connect-src 'self'${opts.dev ? " ws: wss:" : ""}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(opts.https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
