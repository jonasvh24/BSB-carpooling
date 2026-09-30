import { redirect } from "next/navigation";
import { t } from "@/i18n";
import { requireUser } from "@/lib/session";
import { loadOnboardingData } from "@/lib/onboarding-data";
import { TOTAL_STEPS } from "@/lib/validation/onboarding";
import { WizardShell } from "@/components/onboarding/shell";
import { AboutForm } from "@/components/onboarding/about-form";
import { HomeForm } from "@/components/onboarding/home-form";
import { DaysForm } from "@/components/onboarding/days-form";
import { RoleForm } from "@/components/onboarding/role-form";
import { PrefsForm } from "@/components/onboarding/prefs-form";
import { ResearchForm } from "@/components/onboarding/research-form";
import { ConsentForm } from "@/components/onboarding/consent-form";

export const metadata = { title: t.onboarding.title };
export const dynamic = "force-dynamic";

const titles = [
  "",
  t.onboarding.steps.about,
  t.onboarding.steps.home,
  t.onboarding.steps.days,
  t.onboarding.steps.role,
  t.onboarding.steps.prefs,
  t.onboarding.steps.research,
  t.onboarding.steps.consent,
];

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; reconsent?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  // Resume where the user left off; never let the URL skip ahead of saved progress.
  const requested = Number.parseInt(sp.step ?? "", 10);
  const furthest = Math.min(user.onboardingStep, TOTAL_STEPS);
  const step = Number.isInteger(requested) ? Math.max(1, Math.min(requested, furthest)) : furthest;
  if (user.onboardingCompletedAt && !sp.step) redirect("/onboarding?step=7");
  const data = await loadOnboardingData(user);
  const reconsent = sp.reconsent === "1" || Boolean(user.onboardingCompletedAt);

  return (
    <WizardShell step={step} title={titles[step]}>
      {step === 1 && <AboutForm initial={data.about} />}
      {step === 2 && <HomeForm initial={data.home} siteCentre={data.siteCentre} />}
      {step === 3 && <DaysForm sites={data.sites} initial={data.days} />}
      {step === 4 && <RoleForm initial={data.role} />}
      {step === 5 && <PrefsForm initial={data.prefs} />}
      {step === 6 && <ResearchForm initial={data.research} />}
      {step === 7 && <ConsentForm reconsent={reconsent} policyVersion={user.org.policyVersion} />}
    </WizardShell>
  );
}
