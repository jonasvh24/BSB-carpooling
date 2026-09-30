import { t } from "@/i18n";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Badge, Card, PageTitle } from "@/components/ui";
import { resolveReportAction, suspendAction } from "../actions";
import { formatInTimeZone } from "date-fns-tz";

export const metadata = { title: t.admin.reports };
export const dynamic = "force-dynamic";

export default async function AdminReports() {
  const admin = await requireAdmin();
  const reports = await db.report.findMany({
    where: { reporter: { orgId: admin.orgId } },
    include: { reporter: true, reported: true, pool: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  return (
    <>
      <PageTitle>{t.admin.reports}</PageTitle>
      {reports.length === 0 ? (
        <p className="text-muted">—</p>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <Card as="li" key={r.id}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">
                  {r.reporter.name} → {r.reported.name}
                </p>
                <Badge tone={r.status === "OPEN" ? "warn" : "ok"}>{r.status}</Badge>
              </div>
              <p className="text-sm">
                {t.settings.reportReasons[r.reason as keyof typeof t.settings.reportReasons] ?? r.reason}
                {r.pool && ` · ${r.pool.name}`}
              </p>
              {r.details && <p className="mt-1 text-sm italic">“{r.details}”</p>}
              <p className="mt-1 text-xs text-muted">{formatInTimeZone(r.createdAt, admin.org.timezone, "d MMM yyyy HH:mm")}</p>
              {r.status === "OPEN" && (
                <div className="mt-2 flex gap-3 text-sm">
                  <form action={resolveReportAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="underline">
                      {t.admin.ui.resolve}
                    </button>
                  </form>
                  {r.reported.status === "ACTIVE" && (
                    <form action={suspendAction}>
                      <input type="hidden" name="id" value={r.reportedUserId} />
                      <input type="hidden" name="status" value="SUSPENDED" />
                      <button type="submit" className="text-danger underline">
                        {t.admin.suspend} {r.reported.name}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}
