"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, resolveOrgForEmail } from "@/lib/auth";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

export type SignInState = { error?: "invalid" | "notAllowed" | "suspended" | "rateLimited" | "sendFailed" } | null;

export async function requestSignIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "invalid" };
  const { email } = parsed.data;

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`signin:${ip}`, 10, 10 * 60 * 1000) || !rateLimit(`signin:${email}`, 5, 10 * 60 * 1000)) {
    return { error: "rateLimited" };
  }

  const existing = await db.user.findUnique({ where: { email }, select: { status: true } });
  if (existing && existing.status !== "ACTIVE") return { error: "suspended" };
  if (!existing && !(await resolveOrgForEmail(email))) return { error: "notAllowed" };

  // With redirect:false Auth.js never throws: a failed send comes back as the URL of the
  // error page (…/signin/error?error=Configuration). Show that honestly instead of "Check your email".
  const result = await signIn("nodemailer", { email, redirect: false });
  if (typeof result === "string" && /[?&]error=/.test(result)) {
    console.error("[signin] the sign-in email could not be sent; see the [auth] error above.");
    return { error: "sendFailed" };
  }
  // No address in the URL: URLs are logged by servers and tunnels.
  redirect("/signin/sent");
}

export type OwnerState = { error?: "wrong" | "rateLimited" } | null;

// Password sign-in for the owner account only. Attempts are rationed per
// network address and overall, because the password may be short.
export async function ownerSignIn(_prev: OwnerState, formData: FormData): Promise<OwnerState> {
  if (!env.OWNER_EMAIL || !env.OWNER_PASSWORD) return { error: "wrong" };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`owner:${ip}`, 5, 15 * 60 * 1000) || !rateLimit("owner:all", 20, 15 * 60 * 1000)) return { error: "rateLimited" };
  try {
    await signIn("credentials", { email: String(formData.get("email") ?? ""), password: String(formData.get("password") ?? ""), redirectTo: "/admin" });
  } catch (err) {
    if (err instanceof AuthError) return { error: "wrong" };
    throw err; // the redirect on success
  }
  return null;
}

export async function ownerLoginEnabled(): Promise<boolean> {
  return Boolean(env.OWNER_EMAIL && env.OWNER_PASSWORD);
}
