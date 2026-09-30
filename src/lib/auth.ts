import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { db } from "./db";
import { env } from "./env";
import { authConfig } from "./auth.config";
import { sendMail } from "./mail";
import { t, fmt } from "@/i18n";
import { parseList } from "./enums";

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

// Which organisation may this address sign in to? Allowed domain first, then an
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

// The stock adapter creates users with only Auth.js fields; ours need an orgId and role.
function orgAwareAdapter(): Adapter {
  const base = PrismaAdapter(db);
  return {
    ...base,
    async createUser(data: AdapterUser) {
      const email = data.email.toLowerCase();
      const resolved = await resolveOrgForEmail(email);
      if (!resolved) throw new Error("EmailNotAllowed");
      const user = await db.user.create({
        data: {
          email,
          emailVerified: data.emailVerified ?? null,
          name: data.name ?? "",
          orgId: resolved.orgId,
          role: isBootstrapAdmin(email) ? "ADMIN" : "MEMBER",
        },
      });
      if (resolved.invited) {
        await db.invitation.update({ where: { email }, data: { usedAt: new Date() } });
      }
      return { id: user.id, email: user.email, emailVerified: user.emailVerified, name: user.name };
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: orgAwareAdapter(),
  providers: [
    Nodemailer({
      server: { host: env.SMTP_HOST, port: env.SMTP_PORT },
      from: env.EMAIL_FROM,
      maxAge: 24 * 60 * 60,
      async sendVerificationRequest({ identifier, url }) {
        await sendMail({
          to: identifier,
          subject: fmt(t.auth.emailSubject, { app: t.app.name }),
          text: fmt(t.auth.emailBody, { app: t.app.name, url }),
          html: `<p>${fmt(t.auth.emailBody, { app: t.app.name, url }).replace(url, `<a href="${url}">${url}</a>`).replace(/\n/g, "<br>")}</p>`,
        });
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Defence in depth: the sign-in form checks the allowlist too, but the callback is the gate.
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const existing = await db.user.findUnique({ where: { email }, select: { status: true, role: true, id: true } });
      if (existing) {
        if (existing.status !== "ACTIVE") return "/signin/error?error=Suspended";
        // Promote bootstrap admins that were created before ADMIN_EMAILS was set.
        if (existing.role !== "ADMIN" && isBootstrapAdmin(email)) {
          await db.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
        }
        return true;
      }
      return (await resolveOrgForEmail(email)) ? true : "/signin/error?error=NotAllowed";
    },
  },
});
