"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { LIMITS, clientIpFrom, isLimited, recordHit, signInBlocked, takeHit } from "@/lib/auth-limits";
import { PASSWORD_MAX, PASSWORD_MIN, verifyPassword } from "@/lib/password";
import { finishSignup, startSignup } from "@/lib/signup-code";
import { normalisePhone } from "@/lib/sms";
import { finishPasswordReset, startPasswordReset } from "@/lib/password-reset";

const email = z.string().trim().toLowerCase().email();
const password = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

async function clientIp(): Promise<string | null> {
  return clientIpFrom(await headers());
}

export type SignInState = { error?: "invalid" | "wrong" | "suspended" | "rateLimited" } | null;

// Email + password. The attempt limits are enforced inside the Credentials check
// (src/lib/auth.ts); this pre-check only turns a lockout into a clearer message.
// Every failure reads "do not match", whether or not the address has an account.
export async function passwordSignIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = z.object({ email, password: z.string().min(1).max(PASSWORD_MAX) }).safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "invalid" };
  if (await signInBlocked(parsed.data.email, await clientIp())) return { error: "rateLimited" };
  try {
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: "/" });
  } catch (err) {
    if (err instanceof AuthError) {
      // Only someone who knows the password learns that the account is suspended.
      const row = await db.user.findUnique({ where: { email: parsed.data.email }, select: { status: true, passwordHash: true } });
      if (row && row.status !== "ACTIVE" && (await verifyPassword(parsed.data.password, row.passwordHash))) return { error: "suspended" };
      return { error: "wrong" };
    }
    throw err; // the redirect on success
  }
  return null;
}

export type SignUpState =
  | { step: "email"; error?: "invalid" | "notAllowed" | "rateLimited" | "sendFailed" }
  | { step: "code"; email: string; error?: "wrongCode" | "short" | "mismatch" | "badPhone" | "exists" | "suspended" | "notAllowed" | "rateLimited" }
  | null;

// Sign-up step 1: a six-digit code goes to the address (src/lib/signup-code.ts).
export async function requestSignupCode(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const e = email.safeParse(formData.get("email"));
  if (!e.success) return { step: "email", error: "invalid" };
  try {
    const result = await startSignup(e.data, await clientIp());
    if (result !== "sent") return { step: "email", error: result };
  } catch (err) {
    console.error("[signup] could not send the code email:", (err as Error).name);
    return { step: "email", error: "sendFailed" };
  }
  return { step: "code", email: e.data };
}

// Sign-up step 2: code + password create the account (or claim a password-less one).
export async function completeSignup(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  // _prev is this hook's own state, null on the first submit; the email travels in a hidden field.
  const e = email.safeParse(formData.get("email"));
  if (!e.success) return { step: "email", error: "invalid" };
  const base = { step: "code" as const, email: e.data };
  const p = password.safeParse(formData.get("password"));
  if (!p.success) return { ...base, error: "short" };
  if (String(formData.get("confirm") ?? "") !== p.data) return { ...base, error: "mismatch" };
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const phone = rawPhone ? normalisePhone(rawPhone) : null;
  if (rawPhone && !phone) return { ...base, error: "badPhone" };
  const created = await finishSignup(e.data, String(formData.get("code") ?? ""), p.data, phone);
  if (!created.ok) return { ...base, error: created.reason };
  try {
    await signIn("credentials", { email: e.data, password: p.data, redirectTo: "/onboarding" });
  } catch (err) {
    if (err instanceof AuthError) return { step: "email", error: "invalid" };
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
  if (!(await takeHit(`reset:${e.data}`, LIMITS.codeSendPerEmail)) || (ip && !(await takeHit(`reset-ip:${ip}`, LIMITS.codeSendPerIp)))) return { step: "email", error: "rateLimited" };
  try {
    const result = await startPasswordReset(e.data);
    if (result === "noPhone") return { step: "email", error: "noPhone" };
  } catch (err) {
    // Name only: Twilio's error text quotes the destination number.
    console.error("[reset] could not send the SMS:", (err as Error).name);
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
  if (await isLimited(`resetcode:${e.data}`, LIMITS.codeTriesPerEmail)) return { ...base, error: "rateLimited" };
  const ok = await finishPasswordReset(e.data, String(formData.get("code") ?? ""), p.data);
  if (!ok) {
    await recordHit(`resetcode:${e.data}`);
    return { ...base, error: "wrongCode" };
  }
  try {
    await signIn("credentials", { email: e.data, password: p.data, redirectTo: "/" });
  } catch (err) {
    if (err instanceof AuthError) return { step: "email", error: "invalid" };
    throw err; // the redirect on success
  }
  return null;
}
