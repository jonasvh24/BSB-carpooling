import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mail", () => ({ sendMail: async () => {}, devMailbox: () => [] }));
// Auth.js pulls in Next's server runtime, which vitest cannot load; createAccount needs none of it.
vi.mock("next-auth", () => ({ default: () => ({ handlers: {}, auth: async () => null, signIn: async () => {}, signOut: async () => {} }) }));
vi.mock("next-auth/providers/credentials", () => ({ default: (c: unknown) => c }));

import { db } from "@/lib/db";
import { createAccount } from "@/lib/auth";
import { resetDb } from "@/test/factory";
import { seedOrg } from "../../../prisma/seed";

// Netlify re-runs `seed.ts --org` on every deploy. A deploy without
// ALLOWED_EMAIL_DOMAINS must not lock the school out.
describe("allowed email domains", () => {
  it("accepts staff numbers on the school domain", async () => {
    await resetDb();
    process.env.ORG_NAME = "Domain School";
    process.env.ALLOWED_EMAIL_DOMAINS = "britishschool.be";
    process.env.ADMIN_EMAILS = "";
    await seedOrg();
    for (const email of ["012345@britishschool.be", " 067890@BritishSchool.be "]) {
      expect(await createAccount(email, "a-long-password")).toMatchObject({ ok: true });
    }
    expect(await createAccount("someone@gmail.com", "a-long-password")).toEqual({ ok: false, reason: "notAllowed" });
  });

  it("keeps the domains when a later seed runs without ALLOWED_EMAIL_DOMAINS", async () => {
    await resetDb();
    process.env.ORG_NAME = "Domain School";
    process.env.ALLOWED_EMAIL_DOMAINS = "britishschool.be";
    process.env.ADMIN_EMAILS = "";
    await seedOrg();
    delete process.env.ALLOWED_EMAIL_DOMAINS;
    await seedOrg();
    expect(await createAccount("012345@britishschool.be", "a-long-password")).toMatchObject({ ok: true });
  });

  it("treats a domain written with a leading @ as the same domain", async () => {
    await resetDb();
    process.env.ORG_NAME = "Domain School";
    process.env.ALLOWED_EMAIL_DOMAINS = "";
    process.env.ADMIN_EMAILS = "";
    const { org } = await seedOrg();
    await db.organisation.update({ where: { id: org.id }, data: { allowedEmailDomains: "@britishschool.be" } });
    expect(await createAccount("012345@britishschool.be", "a-long-password")).toMatchObject({ ok: true });
  });

  it("keeps domains an administrator added when the env list differs", async () => {
    await resetDb();
    process.env.ORG_NAME = "Domain School";
    process.env.ALLOWED_EMAIL_DOMAINS = "britishschool.be";
    process.env.ADMIN_EMAILS = "";
    const { org } = await seedOrg();
    await db.organisation.update({ where: { id: org.id }, data: { allowedEmailDomains: "britishschool.be,partner.example" } });
    await seedOrg();
    const after = await db.organisation.findUniqueOrThrow({ where: { id: org.id } });
    expect(after.allowedEmailDomains.split(",").sort()).toEqual(["britishschool.be", "partner.example"]);
  });
});
