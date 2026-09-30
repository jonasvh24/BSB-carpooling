import { t } from "@/i18n";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { loadOnboardingData } from "@/lib/onboarding-data";
import { Alert, PageTitle } from "@/components/ui";
import { DaysForm } from "@/components/onboarding/days-form";
import { ExceptionsPanel } from "./exceptions";
import { todayInZone } from "@/lib/time";

export const metadata = { title: t.schedule.title };
export const dynamic = "force-dynamic";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const data = await loadOnboardingData(user);
  const today = todayInZone(user.org.timezone);
  const exceptions = await db.scheduleException.findMany({ where: { userId: user.id, date: { gte: today } }, orderBy: { date: "asc" } });
  return (
    <>
      <PageTitle sub={t.schedule.intro}>{t.schedule.title}</PageTitle>
      {sp.saved && <Alert kind="success">{t.profile.updated}</Alert>}
      <div className="mx-auto max-w-lg">
        <DaysForm sites={data.sites} initial={data.days} returnTo="/schedule" />
        <ExceptionsPanel exceptions={exceptions} today={today} />
      </div>
    </>
  );
}
