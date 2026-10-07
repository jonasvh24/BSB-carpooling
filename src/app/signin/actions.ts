"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, createAccount } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/password";
import { normalisePhone } from "@/lib/sms";
import { finishPasswordReset, startPasswordReset } from "@/lib/password-reset";

const email = z.string().trim().toLowerCase().email();
const password = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

async function clientIp(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export type SignInState = { error?: "invalid" | "wrong" | "noAccount" | "suspended" | "rateLimited" } | null;

// Email + password. Attempts are rationed per network address and per address,
// because a password may be short.
export async function passwordSignIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = z.object({ email, password: z.string().min(1).max(PASSWORD_MAX) }).safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "invalid" };
  const ip = await clientIp();
  if (!rateLimit(`signin:${ip}`, 10, 10 * 60 * 1000) || !rateLimit(`signin:${parsed.data.email}`, 5, 10 * 60 * 1000)) {
    return { error: "rateLimited" };
  }
  const existing = await db.user.findUnique({ where: { email: parsed.data.email }, select: { status: true, passwordHash: true } });
  if (existing && existing.status !== "ACTIVE") return { error: "suspended" };
  try {
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: "/" });
  } catch (err) {
    if (err instanceof AuthError) {
      // No account, or an account without a password yet: point at sign-up, unless the
      // owner pair in .env might match (then the generic message is the honest one).
      return { error: existing?.passwordHash ? "wrong" : existing ? "noAccount" : "wrong" };
    }
    throw err; // the redirect on success
  }
  return null;
}

export type SignUpState = { error?: "invalid" | "short" | "mismatch" | "badPhone" | "notAllowed" | "exists" | "suspended" | "rateLimited" } | null;

// Create an account with a password, no email confirmation (the allowed-domain
// list and admin invitations are the gate). An existing account without a
// password is claimed here by setting one.
export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const e = email.safeParse(formData.get("email"));
  if (!e.success) return { error: "invalid" };
  const p = password.safeParse(formData.get("password"));
  if (!p.success) return { error: "short" };
  if (String(formData.get("confirm") ?? "") !== p.data) return { error: "mismatch" };
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const phone = rawPhone ? normalisePhone(rawPhone) : null;
  if (rawPhone && !phone) return { error: "badPhone" };
  const ip = await clientIp();
  if (!rateLimit(`signup:${ip}`, 10, 10 * 60 * 1000)) return { error: "rateLimited" };
  const created = await createAccount(e.data, p.data, phone);
  if (!created.ok) return { error: created.reason };
  try {
    await signIn("credentials", { email: e.data, password: p.data, redirectTo: "/onboarding" });
  } catch (err) {
    if (err instanceof AuthError) return { error: "invalid" };
    throw err; // the redirect on success
  }
  return null;
}

export type ForgotState = { step: "email"; error?: "invalid" | "rateLimited" | "noPhone" | "sendFailed" } | { step: "code"; email: string; error?: "wrongCode" | "short" | "mismatch" | "rateLimited" } | null;

// Step 1: a six-digit code goes to the mobile number on the account. The reply is
// the same whether or not the address exists, except when the account has no
// number at all (then there is nothing we can do and the person should know).
export async function requestPasswordReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const e = email.safeParse(formData.get("email"));
  if (!e.success) return { step: "email", error: "invalid" };
  const ip = await clientIp();
  if (!rateLimit(`reset:${ip}`, 5, 10 * 60 * 1000) || !rateLimit(`reset:${e.data}`, 3, 10 * 60 * 1000)) return { step: "email", error: "rateLimited" };
  try {
    const result = await startPasswordReset(e.data);
    if (result === "noPhone") return { step: "email", error: "noPhone" };
  } catch (err) {
    console.error("[reset] could not send the SMS:", (err as Error).message);
    return { step: "email", error: "sendFailed" };
  }
  return { step: "code", email: e.data };
}

// Step 2: code + new password. Five wrong codes per address burn the window.
export async function completePasswordReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  // _prev is this hook's own state, null on the first submit; the email travels in a hidden field.
  const e = email.safeParse(formData.get("email"));
  if (!e.success) return { step: "email", error: "invalid" };
  const base = { step: "code" as const, email: e.data };
  const p = password.safeParse(formData.get("password"));
  if (!p.success) return { ...base, error: "short" };
  if (String(formData.get("confirm") ?? "") !== p.data) return { ...base, error: "mismatch" };
  if (!rateLimit(`resetcode:${e.data}`, 5, 10 * 60 * 1000)) return { ...base, error: "rateLimited" };
  const ok = await finishPasswordReset(e.data, String(formData.get("code") ?? ""), p.data);
  if (!ok) return { ...base, error: "wrongCode" };
  try {
    await signIn("credentials", { email: e.data, password: p.data, redirectTo: "/" });
  } catch (err) {
    if (err instanceof AuthError) return { step: "email", error: "invalid" };
    throw err; // the redirect on success
  }
  return null;
}
