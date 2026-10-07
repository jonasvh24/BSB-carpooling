import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { buildCsp } from "@/lib/csp";

const { auth } = NextAuth(authConfig);

// Lightweight redirect-to-sign-in for signed-out visitors, a pathname header for
// layouts, and the Content-Security-Policy with a fresh nonce per request.
// Authorisation proper happens server-side in layouts and actions.
export const proxy = auth((req) => {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    tileUrl: process.env.NEXT_PUBLIC_TILE_URL ?? "",
    https: (process.env.AUTH_URL ?? "").startsWith("https://"),
  });
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|brand|manifest.webmanifest|sw.js|robots.txt).*)"],
};
