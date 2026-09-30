import { t, fmt } from "@/i18n";
import { requireUser } from "@/lib/session";
import { countNearbyIncomplete, loadMatchesFor } from "@/lib/matches-data";
import { Card, PageTitle } from "@/components/ui";
import { MatchCard } from "@/components/match-card";
import { InviteButton } from "@/components/invite-button";
import { env } from "@/lib/env";

export const metadata = { title: t.matches.title };
export const dynamic = "force-dynamic";

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ dir?: string }> }) {
  const user = await requireUser();
  const { dir } = await searchParams;
  const matches = await loadMatchesFor(user.id);
  const am = matches.filter((m) => m.direction === "AM");
  const pm = matches.filter((m) => m.direction === "PM");
  const tab = dir === "PM" || (dir !== "AM" && am.length === 0 && pm.length > 0) ? "PM" : "AM";
  const shown = tab === "AM" ? am : pm;
  const inviteUrl = `${env.AUTH_URL.replace(/\/$/, "")}/signin`;

  return (
    <>
      <PageTitle sub={t.matches.intro}>{t.matches.title}</PageTitle>
      {matches.length === 0 ? (
        <ColdStart userId={user.id} inviteUrl={inviteUrl} />
      ) : (
        <>
          <nav aria-label={t.matches.title} className="mb-5 inline-flex gap-1 rounded-full border border-border bg-surface p-1 shadow-card">
            {(["AM", "PM"] as const).map((d) => (
              <a
                key={d}
                href={`/matches?dir=${d}`}
                aria-current={tab === d ? "page" : undefined}
                className="rounded-full px-4 py-2 text-sm font-semibold text-muted aria-[current=page]:bg-navy aria-[current=page]:text-on-navy"
              >
                {d === "AM" ? t.matches.tabAm : t.matches.tabPm} ({d === "AM" ? am.length : pm.length})
              </a>
            ))}
          </nav>
          {shown.length === 0 ? (
            <p className="text-muted">{t.matches.none}</p>
          ) : (
            <ul className="space-y-4">
              {shown.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </ul>
          )}
          <div className="mt-6">
            <InviteButton url={inviteUrl} />
          </div>
        </>
      )}
    </>
  );
}

async function ColdStart({ userId, inviteUrl }: { userId: string; inviteUrl: string }) {
  const n = await countNearbyIncomplete(userId);
  return (
    <Card>
      <p className="font-medium">{t.matches.none}</p>
      {n > 0 && <p className="mt-1 text-muted">{n === 1 ? t.matches.coldStartOne : fmt(t.matches.coldStart, { n })}</p>}
      <div className="mt-4">
        <InviteButton url={inviteUrl} />
      </div>
    </Card>
  );
}
