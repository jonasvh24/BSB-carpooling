import { t, fmt } from "@/i18n";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Alert, Button, Card, PageTitle } from "@/components/ui";
import { sendSurveyAction } from "../actions";
import { MIN_GROUP } from "@/lib/admin/metrics";

export const metadata = { title: t.admin.surveys };
export const dynamic = "force-dynamic";

export default async function AdminSurveys({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const counts = await db.surveyResponse.groupBy({ by: ["surveyKey"], where: { user: { orgId: admin.orgId } }, _count: true });
  const n = (k: string) => counts.find((c) => c.surveyKey === k)?._count ?? 0;
  // Free text is shown per question, sorted, and only when enough people who
  // agreed to the research have answered; never as one person's set of answers.
  const responses = await db.surveyResponse.findMany({
    where: { surveyKey: { in: ["WEEK4", "EXIT"] }, user: { orgId: admin.orgId, consents: { some: { scope: "PILOT_RESEARCH", withdrawnAt: null } } } },
    select: { surveyKey: true, answers: true },
  });
  const enough = responses.length >= MIN_GROUP;
  const answers = enough ? responses.map((r) => JSON.parse(r.answers) as Record<string, string | number>) : [];
  const texts = (key: string) => answers.map((a) => String(a[key] ?? "").trim()).filter(Boolean).sort();
  return (
    <>
      <PageTitle>{t.admin.surveys}</PageTitle>
      {sp.sent && <Alert kind="success">{fmt(t.admin.surveySent, { n: sp.sent })}</Alert>}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="font-medium">{t.onboarding.steps.research}</h2>
          <p className="text-2xl font-semibold">{n("ONBOARDING")}</p>
        </Card>
        <Card>
          <h2 className="font-medium">{t.survey.week4Title}</h2>
          <p className="text-2xl font-semibold">{n("WEEK4")}</p>
          <form action={sendSurveyAction} className="mt-2">
            <input type="hidden" name="key" value="WEEK4" />
            <Button type="submit" variant="secondary">
              {t.admin.sendWeek4}
            </Button>
          </form>
        </Card>
        <Card>
          <h2 className="font-medium">{t.survey.exitTitle}</h2>
          <p className="text-2xl font-semibold">{n("EXIT")}</p>
          <form action={sendSurveyAction} className="mt-2">
            <input type="hidden" name="key" value="EXIT" />
            <Button type="submit" variant="secondary">
              {t.admin.sendExit}
            </Button>
          </form>
        </Card>
      </div>
      <h2 className="mt-6 mb-2 text-lg font-bold">{t.admin.ui.freeText}</h2>
      {!enough ? (
        <Alert>{fmt(t.admin.ui.suppressed, { min: MIN_GROUP })}</Alert>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {([["worked", t.survey.worked], ["didnt", t.survey.didnt], ["oneChange", t.survey.oneChange]] as const).map(([key, label]) => (
            <Card key={key}>
              <h3 className="font-medium">{label}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {texts(key).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
                {texts(key).length === 0 && <li className="list-none text-muted">—</li>}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
