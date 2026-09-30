import { t, fmt } from "@/i18n";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Alert, Button, Card, PageTitle } from "@/components/ui";
import { sendSurveyAction } from "../actions";

export const metadata = { title: t.admin.surveys };
export const dynamic = "force-dynamic";

export default async function AdminSurveys({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const counts = await db.surveyResponse.groupBy({ by: ["surveyKey"], where: { user: { orgId: admin.orgId } }, _count: true });
  const n = (k: string) => counts.find((c) => c.surveyKey === k)?._count ?? 0;
  const responses = await db.surveyResponse.findMany({ where: { user: { orgId: admin.orgId }, surveyKey: { in: ["WEEK4", "EXIT"] } }, orderBy: { createdAt: "desc" } });
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
      <ul className="space-y-2 text-sm">
        {responses.map((r) => {
          const a = JSON.parse(r.answers) as Record<string, string | number>;
          return (
            <li key={r.id} className="rounded-lg border border-border bg-surface p-3">
              <p className="text-xs text-muted">
                {r.surveyKey} · recommend {a.recommend}
                {a.keep != null && ` · ${t.admin.ui.dash.keep} ${a.keep} · ${t.admin.ui.dash.pay} ${a.pay}`}
              </p>
              {a.worked && <p><strong>{t.survey.worked}</strong> {a.worked}</p>}
              {a.didnt && <p><strong>{t.survey.didnt}</strong> {a.didnt}</p>}
              {a.oneChange && <p><strong>{t.survey.oneChange}</strong> {a.oneChange}</p>}
            </li>
          );
        })}
        {responses.length === 0 && <li className="text-muted">—</li>}
      </ul>
    </>
  );
}
