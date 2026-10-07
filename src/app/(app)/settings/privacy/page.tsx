import { t, fmt } from "@/i18n";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Alert, Button, Card, Input, PageTitle } from "@/components/ui";
import { deleteAccountAction, giveResearchAction, withdrawLocationAction, withdrawResearchAction } from "../actions";
import { formatInTimeZone } from "date-fns-tz";

export const metadata = { title: t.settings.privacy };
export const dynamic = "force-dynamic";

export default async function PrivacySettings({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const consents = await db.consent.findMany({ where: { userId: user.id }, orderBy: { acceptedAt: "desc" } });
  const activeLocation = consents.find((c) => c.scope === "LOCATION_SHARING" && !c.withdrawnAt);
  const activeResearch = consents.find((c) => c.scope === "PILOT_RESEARCH" && !c.withdrawnAt);
  const f = (d: Date) => formatInTimeZone(d, user.org.timezone, "d MMM yyyy");
  return (
    <>
      <PageTitle sub={t.settings.privacyIntro}>{t.settings.privacy}</PageTitle>
      {sp.error && <Alert kind="error">{t.settings.deleteConfirm}</Alert>}
      <Card className="mb-4">
        <h2 className="font-medium">{t.settings.consents}</h2>
        <ul className="mt-2 text-sm">
          {consents.map((c) => (
            <li key={c.id}>
              {c.scope === "LOCATION_SHARING" ? t.onboarding.consent.location.split(":")[0] : t.onboarding.consent.research.split(":")[0]}: {fmt(t.settings.consentGiven, { date: f(c.acceptedAt), version: c.policyVersion })}
              {c.withdrawnAt && <span className="text-muted"> · {fmt(t.settings.consentWithdrawn, { date: f(c.withdrawnAt) })}</span>}
            </li>
          ))}
        </ul>
        {activeLocation ? (
          <form action={withdrawLocationAction} className="mt-3">
            <Button type="submit" variant="secondary">
              {t.onboarding.consent.withdraw}
            </Button>
            <p className="mt-1 text-xs text-muted">{t.onboarding.consent.withdrawHelp}</p>
          </form>
        ) : (
          <p className="mt-2 text-sm">
            <a href="/onboarding?step=7&reconsent=1" className="underline">
              {t.onboarding.steps.consent}
            </a>
          </p>
        )}
        {/* Each consent is withdrawn in one tap, the same effort as giving it. */}
        <form action={activeResearch ? withdrawResearchAction : giveResearchAction} className="mt-3">
          <Button type="submit" variant="secondary">
            {activeResearch ? t.onboarding.consent.withdrawResearch : t.onboarding.consent.giveResearch}
          </Button>
          <p className="mt-1 text-xs text-muted">{activeResearch ? t.onboarding.consent.withdrawResearchHelp : t.onboarding.consent.giveResearchHelp}</p>
        </form>
      </Card>
      <Card className="mb-4">
        <h2 className="font-medium">{t.settings.export}</h2>
        <p className="text-sm text-muted">{t.settings.exportHelp}</p>
        <a href="/api/me/export" download className="mt-2 inline-block underline">
          {t.settings.export}
        </a>
      </Card>
      <Card>
        <h2 className="font-medium text-danger">{t.settings.deleteAccount}</h2>
        <p className="text-sm text-muted">{t.settings.deleteHelp}</p>
        <form action={deleteAccountAction} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block">{t.settings.deleteConfirm}</span>
            <Input name="confirm" required autoComplete="off" />
          </label>
          <Button type="submit" variant="danger">
            {t.settings.deleteAccount}
          </Button>
        </form>
      </Card>
    </>
  );
}
