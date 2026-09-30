import { notFound } from "next/navigation";
import { t, fmt } from "@/i18n";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { parsePlannedRoute, transitUrl, tripAccess } from "@/lib/pools/daily";
import { liftsFor } from "@/lib/pools/lifts";
import { Badge, Button, Card, PageTitle } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { TripQuickActions } from "@/components/trip-actions";
import { acceptLiftAction, thumbsUpAction, verifyAction } from "./actions";
import { formatDateLong } from "@/lib/time";
import { renderReason } from "@/lib/reasons";

export const dynamic = "force-dynamic";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const trip = await tripAccess(id, user.id);
  if (!trip) notFound();
  const planned = parsePlannedRoute(trip.plannedRoute);
  const me = trip.participants.find((p) => p.userId === user.id);
  const isDriver = trip.driverId === user.id;
  const dirLabel = trip.direction === "AM" ? t.matches.am : t.matches.pm;
  const site = { lat: trip.pool.site.lat, lng: trip.pool.site.lng };
  const home = user.homeLat != null && user.homeLng != null ? { lat: user.homeLat, lng: user.homeLng } : null;
  const thumbed = await db.auditLog.findFirst({ where: { actorId: user.id, action: "TRIP_THUMBS_UP", targetId: trip.id } });
  const lifts = trip.status === "CANCELLED" && !isDriver ? await liftsFor(user.id, trip.date, trip.direction as "AM" | "PM", trip.pool.siteId) : [];

  return (
    <>
      <PageTitle sub={`${trip.pool.name} · ${dirLabel}`}>
        {formatDateLong(trip.date, user.org.timezone)}{" "}
        <Badge tone={trip.status === "CANCELLED" ? "danger" : trip.status === "DONE" ? "ok" : "neutral"}>{t.trips.status[trip.status as keyof typeof t.trips.status]}</Badge>
      </PageTitle>

      {trip.status === "CANCELLED" && (
        <Card className="mb-4">
          <p className="font-medium text-danger">{t.trips.driverCancelled}</p>
          {!isDriver && (
            <>
              <h2 className="mt-3 font-medium">{t.trips.findLift}</h2>
              {lifts.length === 0 ? (
                <p className="text-sm text-muted">{t.trips.noLifts}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {lifts.map((l) => (
                    <li key={l.driverId} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={l.driver.name} photoUrl={l.driver.photoUrl} size={36} />
                        <div className="flex-1">
                          <p className="font-medium">{l.driver.name}</p>
                          <p className="text-sm text-muted">{l.details.reasons.slice(0, 3).map(renderReason).join(" · ")}</p>
                        </div>
                        <form action={acceptLiftAction}>
                          <input type="hidden" name="driverId" value={l.driverId} />
                          <input type="hidden" name="date" value={trip.date} />
                          <input type="hidden" name="direction" value={trip.direction} />
                          <input type="hidden" name="siteId" value={trip.pool.siteId} />
                          <Button type="submit" variant="secondary">
                            {t.trips.acceptLift}
                          </Button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {home && (
                <p className="mt-3 text-sm">
                  <a className="underline" href={trip.direction === "AM" ? transitUrl(home, site) : transitUrl(site, home)} target="_blank" rel="noreferrer">
                    {t.trips.publicTransport}
                  </a>
                </p>
              )}
            </>
          )}
        </Card>
      )}

      {planned && (
        <Card className="mb-4">
          <h2 className="font-medium">{t.pools.timetable}</h2>
          <dl className="mt-2 text-sm">
            <div className="flex justify-between py-1">
              <dt className="text-muted">{trip.direction === "AM" ? t.pools.driverLeaves : t.pools.leaveSite}</dt>
              <dd>{planned.driverLeaves}</dd>
            </div>
            {planned.stops.map((s) => {
              const u = trip.participants.find((p) => p.userId === s.userId)?.user;
              return (
                <div key={s.userId} className="flex justify-between py-1">
                  <dt className="text-muted">
                    {trip.direction === "AM" ? t.pools.pickup : t.pools.dropOff} · {u?.name ?? "—"}
                    {s.label && ` (${s.label})`}
                  </dt>
                  <dd>{s.time}</dd>
                </div>
              );
            })}
            {trip.direction === "AM" && (
              <div className="flex justify-between py-1">
                <dt className="text-muted">{t.pools.arrive}</dt>
                <dd>{planned.siteTime}</dd>
              </div>
            )}
          </dl>
          {planned.estimated && <p className="mt-2 text-xs text-warn">{t.matches.estimated}</p>}
        </Card>
      )}

      <Card className="mb-4">
        <h2 className="font-medium">{t.pools.members}</h2>
        <ul className="mt-2 space-y-2">
          {trip.participants.map((p) => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              <Avatar name={p.user?.name ?? "?"} photoUrl={p.user?.photoUrl ?? null} size={32} />
              <span className="flex-1">
                {p.user?.name ?? "—"} {p.userId === trip.driverId && <span className="text-muted">· {t.pools.role.DRIVER}</span>}
              </span>
              <Badge tone={p.status === "IN" ? "ok" : p.status === "NO_SHOW" ? "danger" : "neutral"}>{t.trips.participant[p.status as keyof typeof t.trips.participant]}</Badge>
            </li>
          ))}
        </ul>
        {me && ["PLANNED", "CONFIRMED"].includes(trip.status) && <TripQuickActions tripId={trip.id} status={me.status} isDriver={isDriver} />}
      </Card>

      {isDriver && ["PLANNED", "CONFIRMED"].includes(trip.status) && (
        <Card className="mb-4">
          <h2 className="font-medium">{t.trips.verifyTitle}</h2>
          <form action={verifyAction} className="mt-2 space-y-2">
            <input type="hidden" name="id" value={trip.id} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" name="outcome" value="DONE">
                {t.trips.verifyYes}
              </Button>
              <Button type="submit" name="outcome" value="NOT_HAPPENED" variant="secondary">
                {t.trips.verifyNo}
              </Button>
              <Button type="submit" name="outcome" value="NO_SHOW" variant="secondary">
                {t.trips.verifyNoShow}
              </Button>
            </div>
            <fieldset className="text-sm">
              <legend className="text-muted">{t.trips.whoNoShow}</legend>
              {trip.participants
                .filter((p) => p.userId !== trip.driverId && p.userId)
                .map((p) => (
                  <label key={p.id} className="mr-3 inline-flex items-center gap-1">
                    <input type="checkbox" name="noShow" value={p.userId!} className="h-4 w-4 accent-navy" /> {p.user?.name}
                  </label>
                ))}
            </fieldset>
          </form>
        </Card>
      )}

      {trip.status === "DONE" && me && (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            {trip.kmSaved != null && <span className="text-sm text-muted">{fmt(t.trips.km, { km: trip.kmSaved })} {t.admin.ui.dash.saved}</span>}
            {thumbed ? (
              <span className="text-sm text-ok">{t.trips.thumbsUp}</span>
            ) : (
              <form action={thumbsUpAction}>
                <input type="hidden" name="id" value={trip.id} />
                <Button type="submit" variant="secondary">
                  {t.trips.thumbsUp}
                </Button>
              </form>
            )}
            <a href={`/settings/report?pool=${trip.poolId}`} className="text-sm underline">
              {t.pools.report}
            </a>
          </div>
        </Card>
      )}
    </>
  );
}
