import { t } from "@/i18n";
import { requireAdmin } from "@/lib/session";
import { parseThresholds } from "@/lib/admin/thresholds";
import { Alert, Button, Card, Field, Input, PageTitle } from "@/components/ui";
import { saveOrgAction } from "../actions";

export const metadata = { title: t.admin.settings };
export const dynamic = "force-dynamic";

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const org = admin.org;
  const th = parseThresholds(org.goNoGoThresholds);
  const md = t.admin.metrics;
  const thLabels: Record<keyof typeof th, string> = {
    signupRate: md.signupRate,
    onboarding: md.onboarding,
    matchable: md.matchable,
    poolConversion: md.poolConversion,
    poolSurvival: md.poolSurvival,
    tripCadence: md.tripCadence,
    cancellation: md.cancellation,
    recommend: md.recommend,
    commercial: md.commercial,
  };
  return (
    <>
      <PageTitle>{t.admin.settings}</PageTitle>
      {sp.saved && <Alert kind="success">{t.app.saved}</Alert>}
      <form action={saveOrgAction}>
        <Card className="mb-4">
          <div className="grid gap-x-3 md:grid-cols-2">
            <Field label={t.admin.ui.org.name} htmlFor="name">
              <Input id="name" name="name" defaultValue={org.name} required />
            </Field>
            <Field label={t.admin.ui.org.domains} htmlFor="allowedEmailDomains" help={t.admin.ui.org.domainsHelp}>
              <Input id="allowedEmailDomains" name="allowedEmailDomains" defaultValue={org.allowedEmailDomains.split(",").join(", ")} />
            </Field>
            <Field label={t.admin.ui.org.timezone} htmlFor="timezone">
              <Input id="timezone" name="timezone" defaultValue={org.timezone} required />
            </Field>
            <Field label={t.admin.ui.org.headcount} htmlFor="headcount" help={md.signupRateDef}>
              <Input id="headcount" name="headcount" type="number" min={1} defaultValue={org.headcount} required />
            </Field>
            <Field label={t.admin.ui.org.kmRate} htmlFor="kmRateCents">
              <Input id="kmRateCents" name="kmRateCents" type="number" min={0} defaultValue={org.kmRateCents} required />
            </Field>
            <Field label={t.admin.ui.org.co2} htmlFor="co2GramsPerKm">
              <Input id="co2GramsPerKm" name="co2GramsPerKm" type="number" min={0} defaultValue={org.co2GramsPerKm} required />
            </Field>
            <Field label={t.admin.ui.org.matchable} htmlFor="matchDetourThresholdMin" help={md.matchableDef}>
              <Input id="matchDetourThresholdMin" name="matchDetourThresholdMin" type="number" min={1} max={60} defaultValue={org.matchDetourThresholdMin} required />
            </Field>
            <Field label={t.admin.ui.org.digest} htmlFor="digestTime" help={t.admin.ui.org.digestHelp}>
              <Input id="digestTime" name="digestTime" type="time" defaultValue={org.digestTime} required />
            </Field>
            <Field label={t.admin.ui.org.policy} htmlFor="policyVersion" help={t.admin.ui.org.policyHelp}>
              <Input id="policyVersion" name="policyVersion" defaultValue={org.policyVersion} required />
            </Field>
          </div>
        </Card>
        <Card className="mb-4">
          <h2 className="mb-2 font-medium">{t.admin.thresholds}</h2>
          <div className="grid gap-x-3 md:grid-cols-3">
            {(Object.keys(th) as Array<keyof typeof th>).map((k) => (
              <Field key={k} label={thLabels[k]} htmlFor={`th_${k}`} help={k === "tripCadence" ? t.admin.ui.org.thCadence : k === "cancellation" ? t.admin.ui.org.thMax : t.admin.ui.org.thMin}>
                <Input id={`th_${k}`} name={`th_${k}`} type="number" step="0.01" min={0} defaultValue={th[k]} required />
              </Field>
            ))}
          </div>
        </Card>
        <Button type="submit">{t.app.save}</Button>
      </form>
    </>
  );
}
