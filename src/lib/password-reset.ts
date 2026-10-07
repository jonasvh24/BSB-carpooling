import { createHash, randomInt } from "node:crypto";
import { db } from "./db";
import { hashPassword } from "./password";
import { sendSms } from "./sms";
import { t, fmt } from "@/i18n";

const TTL_MS = 10 * 60 * 1000;
const ident = (email: string) => `pwreset:${email}`;
const digest = (email: string, code: string) => createHash("sha256").update(`${email}:${code}`).digest("hex");

// Six-digit code by text message, valid 10 minutes, single use. Stored hashed in
// VerificationToken (the Auth.js table, otherwise unused now). Returns false when
// the account has no mobile number; the caller shows the same neutral message
// either way so the form does not reveal which addresses exist.
export async function startPasswordReset(email: string): Promise<"sent" | "noPhone" | "noAccount"> {
  const user = await db.user.findUnique({ where: { email }, select: { phone: true, status: true } });
  if (!user || user.status !== "ACTIVE") return "noAccount";
  if (!user.phone) return "noPhone";
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.verificationToken.deleteMany({ where: { identifier: ident(email) } });
  await db.verificationToken.create({ data: { identifier: ident(email), token: digest(email, code), expires: new Date(Date.now() + TTL_MS) } });
  await sendSms(user.phone, fmt(t.auth.smsBody, { app: t.app.name, code }));
  return "sent";
}

export async function finishPasswordReset(email: string, code: string, password: string): Promise<boolean> {
  const row = await db.verificationToken.findUnique({ where: { identifier_token: { identifier: ident(email), token: digest(email, code.trim()) } } });
  if (!row || row.expires < new Date()) return false;
  await db.verificationToken.deleteMany({ where: { identifier: ident(email) } });
  await db.user.update({ where: { email }, data: { passwordHash: await hashPassword(password) } });
  return true;
}
