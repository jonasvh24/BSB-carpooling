import { notFound, redirect } from "next/navigation";
import { t, fmt } from "@/i18n";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { loadPool, weekPlan, routeGeometryFor, driverForWeek } from "@/lib/pools/plan";
import { monthlyTally } from "@/lib/pools/tally";
import { parseDays } from "@/lib/enums";
import { todayInZone, formatDateLong } from "@/lib/time";
import { Alert, Badge, Button, Card, Input, PageTitle, Textarea } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { MeetingPointForm } from "@/components/meeting-point-form";
import { PoolMapClient } from "@/components/pool-map-client";
import { cantMakeItAction, leaveAction, memberDaysAction, pauseAction, rotationAction, sendMessageAction } from "./actions";
import { formatInTimeZone } from "date-fns-tz";
import type { Weekday } from "@/lib/matching/types";

export const dynamicParams = true;
export const revalidate = 0;

export default async function PoolPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ joined?: string; noted?: string; day?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const pool = await loadPool(id);
  if (!pool) notFound();
  // §9.9: only members may read a pool.
  const me = pool.members.find((m) => m.userId === user.id);
  if (!me) redirect("/pools");
  const iAmDriver = me.memberRole === "DRIVER";
  const today = todayInZone(user.org.timezone);
  const plan = await weekPlan(pool, today);
  const weekDriver = driverForWeek(pool, today);
  const planDays = Object.keys(plan).map(Number) as Weekday[];
  const shownDay = (Number(sp.day) as Weekday) || planDays[0];
  const day = shownDay ? plan[shownDay] : undefined;
  const geometry = day ? await routeGeometryFor(day) : null;
  const [messages, trips, tally] = await Promise.all([
    db.message.findMany({ where: { poolId: pool.id }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.trip.findMany({ where: { poolId: pool.id, date: { gte: today } }, include: { participants: true }, orderBy: { date: "asc" }, take: 6 }),
    monthlyTally(pool.id, today.slice(0, 7)),
  ]);
  const nameOf = (uid: string) => pool.members.find((m) => m.userId === uid)?.user.name ?? "—";
  const dirLabel = pool.direction === "AM" ? t.matches.am : t.matches.pm;

  const mapStops = day
    ? [
        ...(pool.direction === "AM" ? [{ ...homeOf(pool, day.driverId), label: `${nameOf(day.driverId)} (${day.times?.driverLeaves ?? ""})`, kind: "driver" as const }] : []),
        ...day.stopUserIds.map((uid) => {
          const m = pool.members.find((x) => x.userId === uid)!;
          const time = day.times?.stops.find((s) => s.userId === uid)?.time ?? "";
          return { lat: m.pickupLat ?? m.user.homeLat!, lng: m.pickupLng ?? m.user.homeLng!, label: `${m.user.name} (${time})${m.pickupLabel ? ` · ${m.pickupLabel}` : ""}`, kind: "stop" as const };
        }),
        { lat: pool.site.lat, lng: pool.site.lng, label: `${pool.site.name} (${day.times?.siteTime ?? ""})`, kind: "site" as const },
        ...(pool.direction === "PM" ? [{ ...homeOf(pool, day.driverId), label: `${nameOf(day.driverId)} (${day.times?.driverHome ?? ""})`, kind: "driver" as const }] : []),
      ]
    : [];

  return (
    <>
      <PageTitle sub={`${dirLabel} · ${pool.site.name}`}>
        {pool.name} <Badge tone={pool.status === "ACTIVE" ? "ok" : "warn"}>{t.pools.status[pool.status as keyof typeof t.pools.status]}</Badge>
      </PageTitle>
      {sp.joined && <Alert kind="success">{t.requests.accepted}</Alert>}
      {sp.noted && <Alert kind="success">{t.pools.exceptionAdded}</Alert>}
      {pool.rotateDrivers && weekDriver && <Alert>{fmt(t.pools.thisWeekDriver, { name: weekDriver.user.name })}</Alert>}

      <Card className="mb-4">
        <h2 className="font-medium">{t.pools.members}</h2>
        <ul className="mt-2 space-y-3">
          {pool.members.map((m) => (
            <li key={m.id} className="flex items-start gap-3 text-sm">
              <Avatar name={m.user.name} photoUrl={m.user.photoUrl} size={40} />
              <div className="flex-1">
                <p className="font-medium">
                  {m.user.name} <span className="font-normal text-muted">· {t.pools.role[m.memberRole as "DRIVER" | "PASSENGER"]}</span>
                </p>
                {/* Phone numbers are visible only inside an accepted pool (§9.3). */}
                {m.user.phone && (
                  <a href={`tel:${m.user.phone}`} className="underline">
                    {m.user.phone}
                  </a>
                )}
                {m.user.profile?.vehicleDesc && m.memberRole === "DRIVER" && <p className="text-muted">{m.user.profile.vehicleDesc}</p>}
                <form action={memberDaysAction} className="mt-1 flex flex-wrap items-center gap-1">
                  <input type="hidden" name="poolId" value={pool.id} />
                  <input type="hidden" name="userId" value={m.userId} />
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <label key={d} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs">
                      <input type="checkbox" name="days" value={d} defaultChecked={parseDays(m.days).includes(d)} disabled={!iAmDriver && m.userId !== user.id} className="accent-navy" />
                      {t.weekdays.short[d]}
                    </label>
                  ))}
                  {(iAmDriver || m.userId === user.id) && (
                    <button type="submit" className="text-xs underline">
                      {t.pools.changeDays}
                    </button>
                  )}
                </form>
                {iAmDriver && m.memberRole === "PASSENGER" && (
                  <div className="mt-1">
                    {m.pickupLabel && <span className="text-muted">{m.pickupLabel} · </span>}
                    <MeetingPointForm poolId={pool.id} member={{ userId: m.userId, name: m.user.name, lat: m.pickupLat ?? m.user.homeLat!, lng: m.pickupLng ?? m.user.homeLng!, label: m.pickupLabel ?? "" }} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mb-4">
        <h2 className="font-medium">{t.pools.timetable}</h2>
        {planDays.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t.trips.noTrips}</p>
        ) : (
          <>
            <nav aria-label={t.pools.timetable} className="mt-2 flex flex-wrap gap-1">
              {planDays.map((d) => (
                <a key={d} href={`/pools/${pool.id}?day=${d}`} aria-current={d === shownDay ? "page" : undefined} className="rounded-md border border-border px-2 py-1 text-sm aria-[current=page]:bg-surface-2 aria-[current=page]:font-medium">
                  {t.weekdays.short[d]}
                </a>
              ))}
            </nav>
            {day?.times && (
              <dl className="mt-3 text-sm">
                <div className="flex justify-between py-1">
                  <dt className="text-muted">{pool.direction === "AM" ? t.pools.driverLeaves : t.pools.leaveSite} · {nameOf(day.driverId)}</dt>
                  <dd>{day.times.driverLeaves}</dd>
                </div>
                {day.times.stops.map((s) => (
                  <div key={s.userId} className="flex justify-between py-1">
                    <dt className="text-muted">
                      {pool.direction === "AM" ? t.pools.pickup : t.pools.dropOff} · {nameOf(s.userId)}
                    </dt>
                    <dd>{s.time}</dd>
                  </div>
                ))}
                <div className="flex justify-between py-1">
                  <dt className="text-muted">{pool.direction === "AM" ? t.pools.arrive : t.pools.leaveSite}</dt>
                  <dd>{day.times.siteTime}</dd>
                </div>
              </dl>
            )}
            {day && !day.times && <p className="mt-2 text-sm text-warn">{t.reasons.detourTooLong}</p>}
            {day?.plan.estimated && <p className="mt-1 text-xs text-warn">{t.matches.estimated}</p>}
            {mapStops.length > 0 && (
              <div className="mt-3">
                <PoolMapClient stops={mapStops} line={geometry?.geometry ?? []} ariaLabel={t.pools.map} />
              </div>
            )}
          </>
        )}
      </Card>

      <Card className="mb-4">
        <h2 className="font-medium">{t.pools.trips}</h2>
        {trips.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t.trips.noTrips}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {trips.map((tr) => (
              <li key={tr.id} className="flex items-center justify-between py-2">
                <a href={`/trips/${tr.id}`} className="underline">
                  {formatDateLong(tr.date, user.org.timezone)} · {tr.plannedDepart}
                </a>
                <Badge tone={tr.status === "CANCELLED" ? "danger" : tr.status === "CONFIRMED" ? "ok" : "neutral"}>{t.trips.status[tr.status as keyof typeof t.trips.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
        <form action={cantMakeItAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="poolId" value={pool.id} />
          <label className="text-sm">
            <span className="block">{t.pools.cantMakeIt}</span>
            <Input type="date" name="date" min={today} required />
          </label>
          <Button type="submit" variant="secondary">
            {t.app.confirm}
          </Button>
          <p className="w-full text-xs text-muted">{t.pools.cantMakeItHelp}</p>
        </form>
      </Card>

      <Card className="mb-4">
        <h2 className="font-medium">{t.pools.chat}</h2>
        <form action={sendMessageAction} className="mt-2 flex gap-2">
          <input type="hidden" name="poolId" value={pool.id} />
          <label className="flex-1">
            <span className="sr-only">{t.pools.chat}</span>
            <Textarea name="body" rows={2} maxLength={1000} placeholder={t.pools.messagePlaceholder} required />
          </label>
          <Button type="submit">{t.pools.sendMessage}</Button>
        </form>
        <ul className="mt-3 space-y-2 text-sm">
          {messages.map((m) => (
            <li key={m.id}>
              <span className="font-medium">{m.user.name}</span>{" "}
              <span className="text-xs text-muted">{formatInTimeZone(m.createdAt, user.org.timezone, "EEE HH:mm")}</span>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      </Card>

      {!tally.hidden && (
        <Card className="mb-4">
          <h2 className="font-medium">
            {t.pools.tally} <span className="font-normal text-muted">· {tally.month}</span>
          </h2>
          {tally.lines.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t.pools.tallyNone}</p>
          ) : (
            <ul className="mt-2 text-sm">
              {tally.lines.map((l, i) => (
                <li key={i}>{fmt(t.pools.tallyOwes, { from: tally.names[l.from], to: tally.names[l.to], amount: (l.cents / 100).toFixed(2) })}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">{t.pools.tallyHelp}</p>
        </Card>
      )}

      {iAmDriver && (
        <Card className="mb-4">
          <div className="flex flex-wrap gap-2">
            <form action={pauseAction}>
              <input type="hidden" name="poolId" value={pool.id} />
              <input type="hidden" name="status" value={pool.status === "PAUSED" ? "ACTIVE" : "PAUSED"} />
              <Button type="submit" variant="secondary">
                {pool.status === "PAUSED" ? t.pools.resume : t.pools.pause}
              </Button>
            </form>
            <form action={rotationAction}>
              <input type="hidden" name="poolId" value={pool.id} />
              <input type="hidden" name="on" value={pool.rotateDrivers ? "0" : "1"} />
              <Button type="submit" variant="secondary">
                {pool.rotateDrivers ? t.pools.rotationOff : t.pools.rotationOn}
              </Button>
            </form>
          </div>
          <p className="mt-2 text-xs text-muted">{t.pools.rotationHelp}</p>
        </Card>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <a href={`/settings/report?pool=${pool.id}`} className="underline">
          {t.pools.report}
        </a>
        <form action={leaveAction}>
          <input type="hidden" name="poolId" value={pool.id} />
          <button type="submit" className="text-danger underline">
            {t.pools.leave}
          </button>
        </form>
      </div>
    </>
  );
}

function homeOf(pool: NonNullable<Awaited<ReturnType<typeof loadPool>>>, userId: string) {
  const m = pool.members.find((x) => x.userId === userId)!;
  return { lat: m.user.homeLat!, lng: m.user.homeLng! };
}
