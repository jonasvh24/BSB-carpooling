import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";

// Loads the signed-in user's database row once per request.
export const getCurrentUser = cache(async () => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await db.user.findUnique({ where: { id }, include: { org: true } });
  if (!user || user.status !== "ACTIVE") return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

// Has the user consented to the organisation's current policy version for both scopes?
export async function hasCurrentConsent(user: CurrentUser): Promise<boolean> {
  const rows = await db.consent.findMany({
    where: { userId: user.id, policyVersion: user.org.policyVersion, withdrawnAt: null },
    select: { scope: true },
  });
  const scopes = new Set(rows.map((r) => r.scope));
  return scopes.has("LOCATION_SHARING") && scopes.has("PILOT_RESEARCH");
}

// Fire-and-forget activity stamp, throttled to once per 10 minutes.
export async function touchLastActive(user: CurrentUser) {
  const stale = !user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > 10 * 60 * 1000;
  if (stale) await db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch(() => {});
}
