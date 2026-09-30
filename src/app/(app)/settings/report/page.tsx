import { t } from "@/i18n";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Alert, Button, Card, Field, PageTitle, Select, Textarea } from "@/components/ui";
import { blockAction, reportAction, unblockAction } from "../actions";

export const metadata = { title: t.settings.reportTitle };
export const dynamic = "force-dynamic";

// Report and block (§9.8). The people you can report are those you have met in
// the app: pool members, matches and request counterparts.
export default async function ReportPage({ searchParams }: { searchParams: Promise<{ pool?: string; sent?: string; user?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [members, matches, requests, blocks] = await Promise.all([
    db.poolMember.findMany({ where: { pool: { members: { some: { userId: user.id } } }, userId: { not: user.id } }, include: { user: true, pool: true } }),
    db.match.findMany({ where: { OR: [{ driverId: user.id }, { passengerId: user.id }] }, include: { driver: true, passenger: true } }),
    db.poolRequest.findMany({ where: { OR: [{ fromUserId: user.id }, { toUserId: user.id }] }, include: { fromUser: true, toUser: true } }),
    db.block.findMany({ where: { blockerId: user.id }, include: { blocked: true } }),
  ]);
  const people = new Map<string, string>();
  for (const m of members) people.set(m.userId, m.user.name);
  for (const m of matches) {
    const o = m.driverId === user.id ? m.passenger : m.driver;
    people.set(o.id, o.name);
  }
  for (const r of requests) {
    const o = r.fromUserId === user.id ? r.toUser : r.fromUser;
    people.set(o.id, o.name);
  }
  return (
    <>
      <PageTitle>{t.settings.reportTitle}</PageTitle>
      {sp.sent && <Alert kind="success">{t.settings.reportSent}</Alert>}
      <Card className="mb-4">
        <form action={reportAction}>
          <input type="hidden" name="poolId" value={sp.pool ?? ""} />
          <Field label={t.admin.ui.report.who} htmlFor="reportedUserId">
            <Select id="reportedUserId" name="reportedUserId" defaultValue={sp.user ?? ""} required>
              <option value="" disabled>
                —
              </option>
              {[...people.entries()].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.settings.reportReason} htmlFor="reason">
            <Select id="reason" name="reason" required defaultValue="NO_SHOW">
              {Object.entries(t.settings.reportReasons).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.settings.reportDetails} htmlFor="details" optional>
            <Textarea id="details" name="details" rows={3} maxLength={1000} />
          </Field>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" name="block" className="h-4 w-4 accent-accent" /> {t.settings.block}
          </label>
          <Button type="submit">{t.app.send}</Button>
        </form>
      </Card>
      <Card>
        <h2 className="font-medium">{t.settings.blocked}</h2>
        {blocks.length === 0 ? (
          <p className="text-sm text-muted">{t.settings.noBlocked}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center justify-between">
                <span>{b.blocked.name}</span>
                <form action={unblockAction}>
                  <input type="hidden" name="userId" value={b.blockedId} />
                  <button type="submit" className="underline">
                    {t.settings.unblock}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {people.size > 0 && (
          <form action={blockAction} className="mt-3 flex items-end gap-2">
            <label className="text-sm">
              <span className="block">{t.settings.block}</span>
              <Select name="userId" required defaultValue="">
                <option value="" disabled>
                  —
                </option>
                {[...people.entries()].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="secondary">
              {t.settings.block}
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}
