import { t } from "@/i18n";
import { requireUser } from "@/lib/session";
import { loadOnboardingData } from "@/lib/onboarding-data";
import { Alert, PageTitle } from "@/components/ui";
import { AboutForm } from "@/components/onboarding/about-form";
import { HomeForm } from "@/components/onboarding/home-form";
import { RoleForm } from "@/components/onboarding/role-form";
import { PrefsForm } from "@/components/onboarding/prefs-form";
import { ResearchForm } from "@/components/onboarding/research-form";
import { db } from "@/lib/db";

export const metadata = { title: t.profile.title };
export const dynamic = "force-dynamic";

// Each section is the same form as the wizard step; saving recomputes matches.
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string; section?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const data = await loadOnboardingData(user);
  const section = sp.section ?? "about";
  // Research answers can be corrected here, but only while research consent is open.
  const research = await db.consent.findFirst({ where: { userId: user.id, scope: "PILOT_RESEARCH", withdrawnAt: null }, select: { id: true } });
  const tabs = [
    ["about", t.profile.about],
    ["home", t.profile.home],
    ["role", t.profile.role],
    ["prefs", t.profile.prefs],
    ...(research ? ([["research", t.profile.research]] as const) : []),
  ] as const;
  return (
    <>
      <PageTitle>{t.profile.title}</PageTitle>
      {sp.saved && <Alert kind="success">{t.profile.updated}</Alert>}
      <nav aria-label={t.profile.title} className="mb-4 flex gap-1 overflow-x-auto">
        {tabs.map(([key, label]) => (
          <a
            key={key}
            href={`/profile?section=${key}`}
            aria-current={section === key ? "page" : undefined}
            className="whitespace-nowrap rounded-md border border-border px-3 py-2 text-sm aria-[current=page]:bg-surface-2 aria-[current=page]:font-medium"
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="mx-auto max-w-lg">
        {section === "about" && <AboutForm initial={data.about} returnTo="/profile" />}
        {section === "home" && <HomeForm initial={data.home} siteCentre={data.siteCentre} returnTo="/profile" />}
        {section === "role" && <RoleForm initial={data.role} returnTo="/profile" />}
        {section === "prefs" && <PrefsForm initial={data.prefs} returnTo="/profile" />}
        {section === "research" && research && <ResearchForm initial={data.research} returnTo="/profile" />}
      </div>
    </>
  );
}
