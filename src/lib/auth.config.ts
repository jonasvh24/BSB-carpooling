import type { NextAuthConfig } from "next-auth";

// Edge-safe part of the Auth.js config (no adapter, no Node-only providers).
// src/lib/auth.ts adds the password (Credentials) provider; src/proxy.ts uses this alone.
export const authConfig = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/signin", error: "/signin/error" },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      // authAt is set once, at sign-in. Unlike iat it survives the sliding refresh, so
      // getCurrentUser can refuse sessions that predate a password change.
      if (user?.id) {
        token.sub = user.id;
        token.authAt = Math.floor(Date.now() / 1000);
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.authAt = typeof token.authAt === "number" ? token.authAt : 0;
      return session;
    },
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const isPublic =
        path === "/" ||
        path.startsWith("/signin") ||
        path.startsWith("/privacy") ||
        path.startsWith("/terms") ||
        path.startsWith("/offline") ||
        path.startsWith("/api/auth") ||
        path.startsWith("/dev/") ||
        path.startsWith("/invite");
      return isPublic || Boolean(auth?.user);
    },
  },
  providers: [],
} satisfies NextAuthConfig;
