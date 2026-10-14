import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
    authAt: number; // seconds; 0 for sessions issued before the field existed
  }
}
