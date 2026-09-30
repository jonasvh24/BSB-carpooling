import { t, fmt } from "@/i18n";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, LinkButton, PageTitle } from "@/components/ui";
import { parseDays } from "@/lib/enums";
import { todayInZone, formatDateLong } from "@/lib/time";
import { TripQuickActions } from "@/components/trip-actions";
import { parsePlannedRoute } from "@/lib/pools/daily";

export const metadata = { title: t.pools.title };
export const dynamic = "force-dynamic";

export default async function PoolsPage() {
  const user = await requireUser();
  const memberships = await db.poolMember.findMany({
    where: { userId: user.id, status: "ACTIVE", pool: { status: { in: ["ACTIVE", "PAUSED", "FORMING"] } } },
    include: { pool: { include: { members: { where: { status: "ACTIVE" }, include: { user: true } } } } },
    orderBy: { joinedAt: "desc" },
  });
  const today = todayInZone(user.org.timezone);
  const trips = await db.trip.findMany({
    where: { date: { gte: today }, status: { in: ["PLANNED", "CONFIRMED", "CANCELLED"] }, participants: { some: { userId: user.id } } },
    include: { participants: true, pool: true },
    orderBy: [{ date: "asc" }, { direction: "asc" }],
    take: 10,
  });
  return (
    <>
      <PageTitle>{t.pools.title}</PageTitle>
      {memberships.length === 0 ? (
        <Card>
          <p>{t.pools.none}</p>
          <div className="mt-3">
            <LinkButton href="/matches" variant="secondary">
              {t.pools.goMatches}
            </LinkButton>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {memberships.map(({ pool, memberRole, days }) => (
            <Card as="li" key={pool.id}>
              <a href={`/pools/${pool.id}`} className="block">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-medium">{pool.name}</h2>
                  <Badge tone={pool.status === "ACTIVE" ? "ok" : "warn"}>{t.pools.status[pool.status as keyof typeof t.pools.status]}</Badge>
                </div>
                <p className="text-sm text-muted">
                  {t.pools.role[memberRole as "DRIVER" | "PASSENGER"]} · {parseDays(days).map((d) => t.weekdays.short[d]).join(", ")} ·{" "}
                  {pool.members.map((m) => m.user.name.split(" ")[0]).join(", ")}
                </p>
              </a>
            </Card>
          ))}
        </ul>
      )}

      <h2 className="mt-8 mb-2 text-lg font-medium">{t.pools.trips}</h2>
      {trips.length === 0 ? (
        <p className="text-muted">{t.trips.noTrips}</p>
      ) : (
        <ul className="space-y-3">
          {trips.map((trip) => {
            const me = trip.participants.find((p) => p.userId === user.id)!;
            const planned = parsePlannedRoute(trip.plannedRoute);
            const myStop = planned?.stops.find((s) => s.userId === user.id);
            return (
              <Card as="li" key={trip.id}>
                <a href={`/trips/${trip.id}`} className="block">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">
                      {trip.date === today ? t.trips.today : formatDateLong(trip.date, user.org.timezone)} · {trip.direction === "AM" ? t.matches.am : t.matches.pm}
                    </p>
                    <Badge tone={trip.status === "CANCELLED" ? "danger" : trip.status === "CONFIRMED" ? "ok" : "neutral"}>{t.trips.status[trip.status as keyof typeof t.trips.status]}</Badge>
                  </div>
                  <p className="text-sm text-muted">
                    {trip.driverId === user.id
                      ? fmt(t.trips.digestDriverTitle, { time: trip.plannedDepart })
                      : fmt(t.matches.pickupAt, { time: myStop?.time ?? trip.plannedDepart })}
                    {" · "}
                    {t.trips.participant[me.status as keyof typeof t.trips.participant]}
                  </p>
                </a>
                {trip.status !== "CANCELLED" && <TripQuickActions tripId={trip.id} status={me.status} isDriver={trip.driverId === user.id} />}
              </Card>
            );
          })}
        </ul>
      )}
    </>
  );
}
