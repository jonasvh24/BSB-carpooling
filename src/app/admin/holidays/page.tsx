import { t } from "@/i18n";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Button, Card, Field, Input, PageTitle } from "@/components/ui";
import { addHolidayAction, removeHolidayAction } from "../actions";

export const metadata = { title: t.admin.holidays };
export const dynamic = "force-dynamic";

export default async function AdminHolidays() {
  const admin = await requireAdmin();
  const days = await db.nonWorkingDay.findMany({ where: { orgId: admin.orgId }, orderBy: { date: "asc" } });
  return (
    <>
      <PageTitle sub={t.admin.ui.holidays.intro}>{t.admin.holidays}</PageTitle>
      <Card className="mb-4">
        <form action={addHolidayAction} className="grid grid-cols-2 gap-x-3 md:grid-cols-4">
          <Field label={t.admin.ui.holidays.from} htmlFor="from">
            <Input id="from" name="from" type="date" required />
          </Field>
          <Field label={t.admin.ui.holidays.to} htmlFor="to" optional>
            <Input id="to" name="to" type="date" />
          </Field>
          <Field label={t.admin.ui.holidays.label} htmlFor="label">
            <Input id="label" name="label" defaultValue="Holiday" required />
          </Field>
          <div className="flex items-end pb-4">
            <Button type="submit">{t.admin.ui.add}</Button>
          </div>
        </form>
      </Card>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
        {days.map((d) => (
          <li key={d.id} className="flex items-center justify-between px-3 py-2">
            <span>
              <strong>{d.date}</strong> · {d.label}
            </span>
            <form action={removeHolidayAction}>
              <input type="hidden" name="id" value={d.id} />
              <button type="submit" className="underline">
                {t.app.delete}
              </button>
            </form>
          </li>
        ))}
        {days.length === 0 && <li className="px-3 py-2 text-muted">—</li>}
      </ul>
    </>
  );
}
