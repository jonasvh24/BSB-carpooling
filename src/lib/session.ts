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
  // A password reset or an administrator setting a password signs out every older session,
  // so whoever had the account before the change loses it.
  if (user.credentialsChangedAt && session.authAt < Math.floor(user.credentialsChangedAt.getTime() / 1000)) return null;
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

// Has the user consented to location sharing under the organisation's current
// policy version? Research consent is optional and never gates the app.
export async function hasCurrentConsent(user: CurrentUser): Promise<boolean> {
  const row = await db.consent.findFirst({
    where: { userId: user.id, scope: "LOCATION_SHARING", policyVersion: user.org.policyVersion, withdrawnAt: null },
    select: { id: true },
  });
  return Boolean(row);
}

// Fire-and-forget activity stamp, throttled to once per 10 minutes.
export async function touchLastActive(user: CurrentUser) {
  const stale = !user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > 10 * 60 * 1000;
  if (stale) await db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch(() => {});
}
