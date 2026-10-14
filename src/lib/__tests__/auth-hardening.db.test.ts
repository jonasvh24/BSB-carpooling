import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  mails: [] as Array<{ to: string; subject: string; text: string }>,
  config: null as null | { providers: Array<{ authorize: (c: unknown, r?: Request) => Promise<unknown> }> },
  session: null as null | { user: { id: string }; authAt: number },
}));

vi.mock("@/lib/mail", () => ({ sendMail: async (m: { to: string; subject: string; text: string }) => void h.mails.push(m), devMailbox: () => [] }));
// Auth.js pulls in Next's server runtime, which vitest cannot load. Capture the config so
// the real authorize() can be called, and let each test choose the session auth() returns.
vi.mock("next-auth", () => ({
  default: (config: typeof h.config) => {
    h.config = config;
    return { handlers: {}, auth: async () => h.session, signIn: async () => {}, signOut: async () => {} };
  },
}));
vi.mock("next-auth/providers/credentials", () => ({ default: (c: unknown) => c }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));

import { db } from "@/lib/db";
import { createAccount } from "@/lib/auth";
import { finishSignup, startSignup } from "@/lib/signup-code";
import { finishPasswordReset } from "@/lib/password-reset";
import { getCurrentUser } from "@/lib/session";
import { verifyPassword, hashPassword } from "@/lib/password";
import { resetDb } from "@/test/factory";

const DOMAIN = "school.test";
const codeFrom = (to: string) => {
  const mail = [...h.mails].reverse().find((m) => m.to === to);
  return mail?.subject.match(/(\d{6})/)?.[1] ?? null;
};
const authorize = (email: string, password: string, ip = "198.51.100.7") =>
  h.config!.providers[0].authorize({ email, password }, new Request("http://localhost/api/auth/callback/credentials", { headers: { "x-forwarded-for": ip } }));

async function org() {
  return db.organisation.create({ data: { name: "School", slug: `s-${Date.now()}-${Math.random()}`, allowedEmailDomains: DOMAIN } });
}

beforeEach(async () => {
  await resetDb();
  await db.rateLimitHit.deleteMany();
  h.mails.length = 0;
  h.session = null;
});

describe("sign-up needs the emailed code", () => {
  it("creates an account only with the code from the mailbox", async () => {
    await org();
    const email = `012345@${DOMAIN}`;
    expect(await startSignup(email, null)).toBe("sent");
    const code = codeFrom(email);
    expect(code).toMatch(/^\d{6}$/);
    expect(await db.user.count({ where: { email } })).toBe(0);

    expect(await finishSignup(email, code === "000000" ? "111111" : "000000", "a-long-password", null)).toEqual({ ok: false, reason: "wrongCode" });
    expect(await finishSignup(email, code!, "a-long-password", null)).toMatchObject({ ok: true });
    // Single use.
    expect(await finishSignup(email, code!, "another-password", null)).toEqual({ ok: false, reason: "wrongCode" });
  });

  it("stores the code keyed, never in clear", async () => {
    await org();
    const email = `012345@${DOMAIN}`;
    await startSignup(email, null);
    const row = await db.verificationToken.findFirstOrThrow({ where: { identifier: `signup:${email}` } });
    expect(row.token).not.toContain(codeFrom(email)!);
    expect(row.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("an attacker cannot claim a password-less administrator without the code", async () => {
    const o = await org();
    const admin = await db.user.create({ data: { email: `012222@${DOMAIN}`, orgId: o.id, role: "ADMIN" } });
    expect(await startSignup(admin.email, null)).toBe("sent"); // the code goes to the real mailbox
    for (const guess of ["000000", "123456", "999999"]) {
      expect(await finishSignup(admin.email, guess, "attacker-password", null)).toMatchObject({ ok: false });
    }
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).passwordHash).toBeNull();
  });

  it("five wrong codes lock the address even for the right code", async () => {
    await org();
    const email = `012345@${DOMAIN}`;
    await startSignup(email, null);
    const code = codeFrom(email)!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await finishSignup(email, wrong, "a-long-password", null);
    expect(await finishSignup(email, code, "a-long-password", null)).toEqual({ ok: false, reason: "rateLimited" });
  });

  it("does not reveal existing accounts: same answer, a notice email instead of a code", async () => {
    await org();
    const email = `012345@${DOMAIN}`;
    expect(await startSignup(email, null)).toBe("sent");
    await finishSignup(email, codeFrom(email)!, "a-long-password", null);
    h.mails.length = 0;
    expect(await startSignup(email, null)).toBe("sent");
    expect(h.mails).toHaveLength(1);
    expect(h.mails[0].subject).toContain("already have");
    expect(codeFrom(email)).toBeNull();
  });

  it("refuses addresses outside the allowed domains and sends nothing", async () => {
    await org();
    expect(await startSignup("someone@gmail.com", null)).toBe("notAllowed");
    expect(h.mails).toHaveLength(0);
  });

  it("limits code emails per address", async () => {
    await org();
    const email = `012345@${DOMAIN}`;
    for (let i = 0; i < 3; i++) expect(await startSignup(email, null)).toBe("sent");
    expect(await startSignup(email, null)).toBe("rateLimited");
  });
});

describe("password sign-in limits hold on the direct Auth.js endpoint", () => {
  it("locks an address after 10 wrong passwords, even when the 11th is right", async () => {
    const o = await org();
    const email = `012345@${DOMAIN}`;
    await db.user.create({ data: { email, orgId: o.id, passwordHash: await hashPassword("the-right-one") } });
    for (let i = 0; i < 10; i++) expect(await authorize(email, `wrong-${i}`, `203.0.113.${i}`)).toBeNull();
    expect(await authorize(email, "the-right-one")).toBeNull();
  });

  it("a correct password clears earlier mistakes", async () => {
    const o = await org();
    const email = `012345@${DOMAIN}`;
    await db.user.create({ data: { email, orgId: o.id, passwordHash: await hashPassword("the-right-one") } });
    for (let i = 0; i < 9; i++) await authorize(email, "wrong");
    expect(await authorize(email, "the-right-one")).toMatchObject({ email });
    for (let i = 0; i < 9; i++) await authorize(email, "wrong");
    expect(await authorize(email, "the-right-one")).toMatchObject({ email });
  });

  it("limits one network address spraying many accounts", async () => {
    await org();
    for (let i = 0; i < 50; i++) await authorize(`user${i}@${DOMAIN}`, "guess", "198.51.100.99");
    const o = await db.organisation.findFirstOrThrow();
    await db.user.create({ data: { email: `fresh@${DOMAIN}`, orgId: o.id, passwordHash: await hashPassword("the-right-one") } });
    expect(await authorize(`fresh@${DOMAIN}`, "the-right-one", "198.51.100.99")).toBeNull();
    expect(await authorize(`fresh@${DOMAIN}`, "the-right-one", "198.51.100.100")).toMatchObject({ email: `fresh@${DOMAIN}` });
  });
});

describe("changing a password signs out older sessions", () => {
  it("refuses a session from before a password reset, accepts one from after", async () => {
    const o = await org();
    const email = `012345@${DOMAIN}`;
    const user = await db.user.create({ data: { email, orgId: o.id, passwordHash: await hashPassword("old-password") } });
    const before = Math.floor(Date.now() / 1000) - 60;
    h.session = { user: { id: user.id }, authAt: before };
    expect(await getCurrentUser()).toMatchObject({ id: user.id });

    await db.verificationToken.create({ data: { identifier: `pwreset:${email}`, token: (await import("node:crypto")).createHash("sha256").update(`${email}:123456`).digest("hex"), expires: new Date(Date.now() + 60_000) } });
    expect(await finishPasswordReset(email, "123456", "new-password")).toBe(true);
    expect(await verifyPassword("new-password", (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash)).toBe(true);

    h.session = { user: { id: user.id }, authAt: before };
    expect(await getCurrentUser()).toBeNull();
    h.session = { user: { id: user.id }, authAt: Math.floor(Date.now() / 1000) };
    expect(await getCurrentUser()).toMatchObject({ id: user.id });
  });

  it("claiming a password-less account also ends older sessions", async () => {
    const o = await org();
    const user = await db.user.create({ data: { email: `012222@${DOMAIN}`, orgId: o.id, role: "ADMIN" } });
    expect(await createAccount(user.email, "a-long-password")).toMatchObject({ ok: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).credentialsChangedAt).not.toBeNull();
  });
});
