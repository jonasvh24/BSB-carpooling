import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { env, isDevConvenienceEnabled } from "./env";
import { authConfig } from "./auth.config";
import { parseList } from "./enums";
import { hashPassword, verifyPassword } from "./password";
import { clearSignInFailures, clientIpFrom, recordSignInFailure, signInBlocked } from "./auth-limits";

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

// Which organisation may this address join? Allowed domain first, then an
// admin invitation. Returns null when the address is not welcome anywhere.
export async function resolveOrgForEmail(email: string): Promise<{ orgId: string; invited: boolean } | null> {
  const lower = email.trim().toLowerCase();
  const domain = emailDomain(lower);
  const orgs = await db.organisation.findMany({ select: { id: true, allowedEmailDomains: true } });
  for (const org of orgs) {
    if (parseList(org.allowedEmailDomains).includes(domain)) return { orgId: org.id, invited: false };
  }
  const invitation = await db.invitation.findUnique({ where: { email: lower } });
  if (invitation) return { orgId: invitation.orgId, invited: true };
  return null;
}

export function isBootstrapAdmin(email: string): boolean {
  return parseList(env.ADMIN_EMAILS).includes(email.trim().toLowerCase());
}

export type CreateAccountResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "notAllowed" | "exists" | "suspended" };

// Creates the account, or claims one that exists without a password (seeded
// administrators, accounts from before passwords). Only call this after the person has
// proved they read the mailbox (src/lib/signup-code.ts): the claim branch has no other
// check, and without that proof anyone could take over an administrator's address.
export async function createAccount(email: string, password: string, phone: string | null = null): Promise<CreateAccountResult> {
  const lower = email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email: lower } });
  const passwordHash = await hashPassword(password);
  if (existing) {
    if (existing.status !== "ACTIVE") return { ok: false, reason: "suspended" };
    if (existing.passwordHash) return { ok: false, reason: "exists" };
    await db.user.update({ where: { id: existing.id }, data: { passwordHash, credentialsChangedAt: new Date(), phone: existing.phone ?? phone, emailVerified: existing.emailVerified ?? new Date() } });
    return { ok: true, userId: existing.id };
  }
  const resolved = await resolveOrgForEmail(lower);
  if (!resolved) return { ok: false, reason: "notAllowed" };
  const user = await db.user.create({
    data: {
      email: lower,
      emailVerified: new Date(),
      passwordHash,
      phone,
      orgId: resolved.orgId,
      role: isBootstrapAdmin(lower) ? "ADMIN" : "MEMBER",
    },
  });
  if (resolved.invited) await db.invitation.update({ where: { email: lower }, data: { usedAt: new Date() } });
  return { ok: true, userId: user.id };
}

// Compare in constant time, on hashes so the lengths always match.
function sameSecret(a: string, b: string): boolean {
  const h = (x: string) => createHash("sha256").update(x).digest();
  return timingSafeEqual(h(a), h(b));
}

// The owner account (OWNER_EMAIL / OWNER_PASSWORD in .env): an administrator who
// signs in with the password from the environment, for someone without a mailbox
// on the school's domain. Returns the user row, created on first use, or null.
export async function ownerLogin(email: string, password: string) {
  if (!env.OWNER_EMAIL || !env.OWNER_PASSWORD) return null;
  const okEmail = sameSecret(email.trim().toLowerCase(), env.OWNER_EMAIL);
  const okPassword = sameSecret(password, env.OWNER_PASSWORD);
  if (!okEmail || !okPassword) return null;
  const existing = await db.user.findUnique({ where: { email: env.OWNER_EMAIL } });
  if (existing) {
    if (existing.role !== "ADMIN" || existing.status !== "ACTIVE") {
      return db.user.update({ where: { id: existing.id }, data: { role: "ADMIN", status: "ACTIVE" } });
    }
    return existing;
  }
  const org = await db.organisation.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return null;
  return db.user.create({ data: { email: env.OWNER_EMAIL, emailVerified: new Date(), orgId: org.id, role: "ADMIN", name: env.OWNER_EMAIL.split("@")[0] } });
}

// Email + password for everyone. The owner pair from .env is checked first.
export async function passwordLogin(email: string, password: string) {
  const owner = await ownerLogin(email, password);
  if (owner) return owner;
  const lower = email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email: lower } });
  if (!user || user.status !== "ACTIVE") return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  // Promote bootstrap admins that were created before ADMIN_EMAILS was set.
  if (user.role !== "ADMIN" && isBootstrapAdmin(lower)) {
    return db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  }
  return user;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, devUserId: {} },
      async authorize(c, request) {
        // Development only: /dev/login-as switches into any user without a password.
        const devUserId = typeof c?.devUserId === "string" ? c.devUserId : "";
        if (devUserId) {
          if (!isDevConvenienceEnabled()) return null;
          const user = await db.user.findUnique({ where: { id: devUserId } });
          return user ? { id: user.id, email: user.email, name: user.name } : null;
        }
        // Limits live here, not only in the sign-in form's action: Auth.js also exposes this
        // check at POST /api/auth/callback/credentials, which a script can call directly.
        const email = String(c?.email ?? "").trim().toLowerCase();
        const ip = clientIpFrom(request?.headers);
        if (!email || (await signInBlocked(email, ip))) return null;
        const user = await passwordLogin(email, String(c?.password ?? ""));
        if (!user) {
          await recordSignInFailure(email, ip);
          return null;
        }
        await clearSignInFailures(email);
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      if (!user.id) return false;
      const existing = await db.user.findUnique({ where: { id: user.id }, select: { status: true } });
      if (!existing) return false;
      return existing.status === "ACTIVE" ? true : "/signin/error?error=Suspended";
    },
  },
});
