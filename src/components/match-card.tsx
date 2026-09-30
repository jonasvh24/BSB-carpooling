import { t, fmt } from "@/i18n";
import type { MatchView } from "@/lib/matches-data";
import { renderReason } from "@/lib/reasons";
import { Badge, Card } from "./ui";
import { dismissMatch } from "@/app/(app)/matches/actions";
import { RequestForm } from "./request-form";
import { Avatar } from "./avatar";

export function MatchCard({ match: m }: { match: MatchView }) {
  const days = m.sharedDays.map((d) => t.weekdays.short[d]).join(", ");
  return (
    <Card as="li">
      <div className="flex items-start gap-3">
        <Avatar name={m.other.name} photoUrl={m.other.photoUrl} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="truncate text-lg font-bold">{m.other.name}</h2>
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-base font-bold text-[#3c3011] ring-4 ring-gold-soft"
              aria-label={`${t.matches.score} ${m.score}`}
            >
              {m.score}
            </span>
          </div>
          <p className="text-sm text-muted">
            {m.iDrive ? t.matches.youDrive : t.matches.theyDrive} · {days}
            {m.other.vehicleDesc && ` · ${m.other.vehicleDesc}`}
          </p>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Reasons">
        {m.reasons.map((r, i) => (
          <li key={i}>
            <Badge tone={r.code === "estimated" ? "warn" : r.code === "rotation" ? "accent" : "neutral"}>{renderReason(r)}</Badge>
          </li>
        ))}
      </ul>

      {m.other.notes && <p className="mt-3 text-sm italic">“{m.other.notes}”</p>}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-navy dark:text-gold">{t.matches.perDay}</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-normal">{t.pools.days}</th>
              <th className="py-1 font-normal">{m.direction === "AM" ? t.pools.pickup : t.pools.leaveSite}</th>
              <th className="py-1 font-normal">{m.direction === "AM" ? t.pools.arrive : t.pools.dropOff}</th>
            </tr>
          </thead>
          <tbody>
            {m.sharedDays.map((d) => {
              const day = m.days[String(d)];
              if (!day) return null;
              return (
                <tr key={d} className="border-t border-border">
                  <td className="py-1">{t.weekdays.long[d]}</td>
                  <td className="py-1">{m.direction === "AM" ? day.pickupTime : day.siteTime}</td>
                  <td className="py-1">{m.direction === "AM" ? day.siteTime : day.pickupTime}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-muted">{t.matches.approxNote}</p>
        {m.other.reliability && (
          <p className="text-muted">
            {fmt(t.matches.reliability, { pct: Math.round((m.other.reliability.done / m.other.reliability.planned) * 100), n: m.other.reliability.planned })}
          </p>
        )}
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {m.pendingRequestId ? (
          <a href="/requests" className="text-sm underline">
            {m.pendingDirection === "out" ? t.matches.requestSent : t.matches.requestPending}
          </a>
        ) : (
          <RequestForm matchId={m.id} sharedDays={m.sharedDays} label={m.iDrive ? t.matches.inviteToPool : t.matches.askToJoin} />
        )}
        <form action={dismissMatch}>
          <input type="hidden" name="id" value={m.id} />
          <button type="submit" className="min-h-11 rounded-full px-4 text-sm font-semibold text-muted hover:bg-surface-2">
            {t.matches.dismiss}
          </button>
        </form>
      </div>
    </Card>
  );
}
