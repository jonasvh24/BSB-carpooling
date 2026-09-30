import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hasCurrentConsent, requireUser, touchLastActive } from "@/lib/session";
import { AppNav } from "@/components/app-nav";
import { ensureTomorrowTrips } from "@/lib/jobs";

// Every signed-in page lives under this layout. Onboarding and re-consent are
// enforced here so no page can be reached without them.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const path = (await headers()).get("x-pathname") ?? "";
  const onboarding = path.startsWith("/onboarding");
  if (!user.onboardingCompletedAt && !onboarding && !path.startsWith("/settings")) redirect("/onboarding");
  if (user.onboardingCompletedAt && !onboarding && !path.startsWith("/settings") && !(await hasCurrentConsent(user))) {
    redirect("/onboarding?step=7&reconsent=1");
  }
  await touchLastActive(user);
  // §7.4: tomorrow's trips are materialised on demand when the app is opened (throttled).
  void ensureTomorrowTrips(user.orgId);
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  return (
    <>
      <AppNav isAdmin={user.role === "ADMIN"} unread={unread} current={path} />
      <main id="main" className="mx-auto max-w-3xl px-4 py-4 pb-24">
        {children}
      </main>
    </>
  );
}
