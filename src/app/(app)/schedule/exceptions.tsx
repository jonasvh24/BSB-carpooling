import { t } from "@/i18n";
import { Button, Input, Select } from "@/components/ui";
import { addException, removeException } from "./actions";

type Exception = { id: string; date: string; kind: string; arriveBy: string | null; departEarliest: string | null; note: string | null };

// Days off and one-off time changes. Server-rendered form; no client state needed.
export function ExceptionsPanel({ exceptions, today }: { exceptions: Exception[]; today: string }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{t.schedule.exceptions}</h2>
      {exceptions.length > 0 && (
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
          {exceptions.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                <strong>{e.date}</strong> · {e.kind === "OFF" ? t.schedule.kindOff : `${t.schedule.kindChanged} ${e.arriveBy ?? "–"} / ${e.departEarliest ?? "–"}`}
                {e.note && <span className="text-muted"> · {e.note}</span>}
              </span>
              <form action={removeException}>
                <input type="hidden" name="id" value={e.id} />
                <button type="submit" className="underline">
                  {t.app.delete}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={addException} className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface p-3">
        <label className="col-span-2 text-sm">
          <span className="block text-muted">{t.pools.exceptionDate}</span>
          <Input type="date" name="date" min={today} required />
        </label>
        <label className="col-span-2 text-sm">
          <span className="block text-muted">{t.schedule.addException}</span>
          <Select name="kind" defaultValue="OFF">
            <option value="OFF">{t.schedule.kindOff}</option>
            <option value="CHANGED">{t.schedule.kindChanged}</option>
          </Select>
        </label>
        <label className="text-sm">
          <span className="block text-muted">{t.onboarding.days.gridArrive}</span>
          <Input type="time" name="arriveBy" step={300} />
        </label>
        <label className="text-sm">
          <span className="block text-muted">{t.onboarding.days.gridDepart}</span>
          <Input type="time" name="departEarliest" step={300} />
        </label>
        <label className="col-span-2 text-sm">
          <span className="block text-muted">{t.pools.exceptionNote}</span>
          <Input name="note" maxLength={120} />
        </label>
        <div className="col-span-2">
          <Button type="submit" variant="secondary" full>
            {t.schedule.addException}
          </Button>
        </div>
      </form>
    </section>
  );
}
