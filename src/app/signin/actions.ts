"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, resolveOrgForEmail } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

export type SignInState = { error?: "invalid" | "notAllowed" | "suspended" | "rateLimited" } | null;

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

  await signIn("nodemailer", { email, redirect: false });
  redirect(`/signin/sent?email=${encodeURIComponent(email)}`);
}
