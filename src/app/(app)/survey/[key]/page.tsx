import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@/i18n";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Alert, Button, Card, ChoiceGroup, Field, PageTitle, Textarea } from "@/components/ui";
import { submitSurvey } from "./actions";

export const dynamic = "force-dynamic";

// §8.3: week-4 and exit surveys. Trips shared so far is auto-filled.
export default async function SurveyPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ done?: string }> }) {
  const user = await requireUser();
  const { key } = await params;
  const sp = await searchParams;
  const surveyKey = key === "week4" ? "WEEK4" : key === "exit" ? "EXIT" : null;
  if (!surveyKey) notFound();
  const existing = await db.surveyResponse.findFirst({ where: { userId: user.id, surveyKey } });
  const trips = await db.tripParticipant.count({ where: { userId: user.id, status: "IN", trip: { status: "DONE" } } });
  const title = surveyKey === "EXIT" ? t.survey.exitTitle : t.survey.week4Title;
  const consent = await db.consent.findFirst({ where: { userId: user.id, scope: "PILOT_RESEARCH", withdrawnAt: null }, select: { id: true } });
  if (!consent) {
    return (
      <>
        <PageTitle>{title}</PageTitle>
        <Alert>
          {t.survey.needsConsent}{" "}
          <Link href="/settings/privacy" className="underline">
            {t.settings.privacy}
          </Link>
        </Alert>
      </>
    );
  }
  if (sp.done || existing) {
    return (
      <>
        <PageTitle>{title}</PageTitle>
        <Alert kind="success">{sp.done ? t.survey.thanks : t.survey.alreadyDone}</Alert>
      </>
    );
  }
  const yn = [
    { value: "YES", label: t.onboarding.research.r8o.YES },
    { value: "MAYBE", label: t.onboarding.research.r8o.MAYBE },
    { value: "NO", label: t.onboarding.research.r8o.NO },
  ];
  return (
    <>
      <PageTitle>{title}</PageTitle>
      <Card>
        <form action={submitSurvey}>
          <input type="hidden" name="key" value={surveyKey} />
          <p className="mb-4 text-sm">
            {t.survey.tripsSoFar}: <strong>{trips}</strong>
          </p>
          <ChoiceGroup name="recommend" legend={t.survey.recommend} help={t.survey.recommendHelp} columns={3} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} />
          <Field label={t.survey.worked} htmlFor="worked" optional>
            <Textarea id="worked" name="worked" rows={2} maxLength={1000} />
          </Field>
          <Field label={t.survey.didnt} htmlFor="didnt" optional>
            <Textarea id="didnt" name="didnt" rows={2} maxLength={1000} />
          </Field>
          <Field label={t.survey.oneChange} htmlFor="oneChange" optional>
            <Textarea id="oneChange" name="oneChange" rows={2} maxLength={1000} />
          </Field>
          {surveyKey === "EXIT" && (
            <>
              <ChoiceGroup name="keep" legend={t.survey.keep} columns={3} options={yn} />
              <ChoiceGroup name="pay" legend={t.survey.pay} columns={3} options={yn} />
            </>
          )}
          <Button type="submit">{t.app.send}</Button>
        </form>
      </Card>
    </>
  );
}
