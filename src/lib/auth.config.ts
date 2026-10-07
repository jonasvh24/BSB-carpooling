import type { NextAuthConfig } from "next-auth";

// Edge-safe part of the Auth.js config (no adapter, no Node-only providers).
// src/lib/auth.ts adds the adapter and the Nodemailer provider; src/proxy.ts uses this alone.
export const authConfig = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/signin", verifyRequest: "/signin/sent", error: "/signin/error" },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
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
