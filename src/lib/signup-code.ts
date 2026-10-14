import { createHmac, randomInt } from "node:crypto";
import { db } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";
import { renderEmail } from "./notify";
import { createAccount, resolveOrgForEmail, type CreateAccountResult } from "./auth";
import { LIMITS, isLimited, recordHit } from "./auth-limits";
import { t, fmt } from "@/i18n";

// Sign-up proves the person can read the mailbox: a six-digit code goes to the address,
// and only the code unlocks account creation. Without it anyone could register a
// colleague's address, or claim a password-less account such as a seeded administrator.

const TTL_MIN = 15;
const ident = (email: string) => `signup:${email}`;
// Keyed with AUTH_SECRET so a database leak alone does not let anyone brute-force the
// six digits offline during the code's lifetime.
const digest = (email: string, code: string) => createHmac("sha256", env.AUTH_SECRET).update(`${ident(email)}:${code}`).digest("hex");
const baseUrl = () => env.AUTH_URL.replace(/\/$/, "");

export type StartSignupResult = "sent" | "notAllowed" | "rateLimited";

// Step 1. The reply is "sent" whether or not an account exists, so the form does not
// reveal who is registered. Existing accounts get a "you already have an account" email
// instead of a code; suspended accounts get nothing.
export async function startSignup(email: string, ip: string | null): Promise<StartSignupResult> {
  const existing = await db.user.findUnique({ where: { email }, select: { status: true, passwordHash: true } });
  if (!existing && !(await resolveOrgForEmail(email))) return "notAllowed";
  if (await isLimited(`code-send:${email}`, LIMITS.codeSendPerEmail)) return "rateLimited";
  if (ip && (await isLimited(`code-send-ip:${ip}`, LIMITS.codeSendPerIp))) return "rateLimited";
  await recordHit(`code-send:${email}`);
  if (ip) await recordHit(`code-send-ip:${ip}`);

  if (existing?.status && existing.status !== "ACTIVE") return "sent";
  if (existing?.passwordHash) {
    const content = { title: t.auth.existsEmailTitle, body: t.auth.existsEmailBody };
    await sendMail({ to: email, subject: content.title, ...renderEmail(content, `${baseUrl()}/signin`, t.auth.codeEmailFooter) });
    return "sent";
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.verificationToken.deleteMany({ where: { identifier: ident(email) } });
  await db.verificationToken.create({ data: { identifier: ident(email), token: digest(email, code), expires: new Date(Date.now() + TTL_MIN * 60 * 1000) } });
  const content = { title: fmt(t.auth.codeEmailTitle, { code }), body: fmt(t.auth.codeEmailBody, { code, minutes: String(TTL_MIN) }) };
  await sendMail({ to: email, subject: content.title, ...renderEmail(content, `${baseUrl()}/signin/new`, t.auth.codeEmailFooter) });
  return "sent";
}

export type FinishSignupResult = CreateAccountResult | { ok: false; reason: "wrongCode" | "rateLimited" };

// Step 2. Five wrong codes per address burn the window; a correct code is single use.
export async function finishSignup(email: string, code: string, password: string, phone: string | null): Promise<FinishSignupResult> {
  if (await isLimited(`code-try:${email}`, LIMITS.codeTriesPerEmail)) return { ok: false, reason: "rateLimited" };
  const row = await db.verificationToken.findUnique({ where: { identifier_token: { identifier: ident(email), token: digest(email, code.trim()) } } });
  if (!row || row.expires < new Date()) {
    await recordHit(`code-try:${email}`);
    return { ok: false, reason: "wrongCode" };
  }
  await db.verificationToken.deleteMany({ where: { identifier: ident(email) } });
  return createAccount(email, password, phone);
}
