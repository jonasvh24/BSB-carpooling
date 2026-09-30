import { t, fmt } from "@/i18n";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Alert, Badge, Button, Card, PageTitle, Select } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { acceptAction, declineAction, withdrawAction } from "./actions";
import { REQUEST_EXPIRY_DAYS } from "@/lib/pools/service";
import { formatDateLong } from "@/lib/time";
import { formatISO, addDays } from "date-fns";
import { parseDays } from "@/lib/enums";

export const metadata = { title: t.requests.title };
export const dynamic = "force-dynamic";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;
  const [incoming, outgoing] = await Promise.all([
    db.poolRequest.findMany({ where: { toUserId: user.id }, include: { fromUser: true }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.poolRequest.findMany({ where: { fromUserId: user.id }, include: { toUser: true }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const tone = (s: string) => (s === "PENDING" ? "accent" : s === "ACCEPTED" ? "ok" : "neutral") as "accent" | "ok" | "neutral";
  const expiry = (d: Date) => formatDateLong(formatISO(addDays(d, REQUEST_EXPIRY_DAYS), { representation: "date" }), user.org.timezone);
  const dayList = (days: string) => parseDays(days).map((d) => t.weekdays.short[d]).join(", ");
  return (
    <>
      <PageTitle>{t.requests.title}</PageTitle>
      {error && <Alert kind="error">{fmt(t.requests.infeasible, { reason: error })}</Alert>}
      <h2 className="mb-2 text-lg font-medium">{t.requests.incoming}</h2>
      {incoming.length === 0 ? (
        <p className="mb-6 text-muted">{t.requests.none}</p>
      ) : (
        <ul className="mb-6 space-y-3">
          {incoming.map((r) => (
            <Card as="li" key={r.id}>
              <div className="flex items-center gap-3">
                <Avatar name={r.fromUser.name} photoUrl={r.fromUser.photoUrl} size={40} />
                <div className="flex-1">
                  <p className="font-medium">{fmt(t.requests.from, { name: r.fromUser.name })}</p>
                  <p className="text-sm text-muted">
                    {r.direction === "AM" ? t.matches.am : t.matches.pm} · {dayList(r.days)}
                  </p>
                </div>
                <Badge tone={tone(r.status)}>{t.requests.status[r.status as keyof typeof t.requests.status]}</Badge>
              </div>
              {r.message && <p className="mt-2 text-sm italic">“{r.message}”</p>}
              {r.status === "PENDING" && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <form action={acceptAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button type="submit">{t.requests.accept}</Button>
                  </form>
                  <form action={declineAction} className="flex items-end gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <label className="text-sm">
                      <span className="sr-only">{t.requests.declineReason}</span>
                      <Select name="reason" defaultValue="" className="min-w-40">
                        <option value="">{t.requests.declineReason}</option>
                        {Object.entries(t.requests.reasons).map(([k, v]) => (
                          <option key={k} value={v}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <Button type="submit" variant="secondary">
                      {t.requests.decline}
                    </Button>
                  </form>
                  <span className="text-xs text-muted">{fmt(t.requests.expires, { date: expiry(r.createdAt) })}</span>
                </div>
              )}
            </Card>
          ))}
        </ul>
      )}
      <h2 className="mb-2 text-lg font-medium">{t.requests.outgoing}</h2>
      {outgoing.length === 0 ? (
        <p className="text-muted">{t.requests.none}</p>
      ) : (
        <ul className="space-y-3">
          {outgoing.map((r) => (
            <Card as="li" key={r.id}>
              <div className="flex items-center gap-3">
                <Avatar name={r.toUser.name} photoUrl={r.toUser.photoUrl} size={40} />
                <div className="flex-1">
                  <p className="font-medium">{fmt(t.requests.to, { name: r.toUser.name })}</p>
                  <p className="text-sm text-muted">
                    {r.direction === "AM" ? t.matches.am : t.matches.pm} · {dayList(r.days)}
                  </p>
                </div>
                <Badge tone={tone(r.status)}>{t.requests.status[r.status as keyof typeof t.requests.status]}</Badge>
              </div>
              {r.status === "PENDING" && (
                <form action={withdrawAction} className="mt-3">
                  <input type="hidden" name="id" value={r.id} />
                  <Button type="submit" variant="secondary">
                    {t.requests.withdraw}
                  </Button>
                </form>
              )}
              {r.status === "ACCEPTED" && r.poolId && (
                <a href={`/pools/${r.poolId}`} className="mt-3 inline-block text-sm underline">
                  {t.requests.accepted}
                </a>
              )}
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}
