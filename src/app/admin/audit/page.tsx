import { t } from "@/i18n";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { formatInTimeZone } from "date-fns-tz";

export const metadata = { title: t.admin.audit };
export const dynamic = "force-dynamic";

export default async function AdminAudit() {
  const admin = await requireAdmin();
  // Scoped to the organisation. Rows without an organisation (the per-user
  // "good trip" marks) are not administrative actions and never appear here.
  const rows = await db.auditLog.findMany({ where: { orgId: admin.orgId }, orderBy: { createdAt: "desc" }, take: 200 });
  const actors = await db.user.findMany({ where: { orgId: admin.orgId, id: { in: rows.map((r) => r.actorId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } });
  const nameOf = (id: string | null) => (id ? (actors.find((a) => a.id === id)?.email ?? id) : t.admin.ui.system);
  return (
    <>
      <PageTitle>{t.admin.audit}</PageTitle>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              {(["when", "actor", "action", "target", "details"] as const).map((k) => (
                <th key={k} className="p-2">
                  {t.admin.ui.cols[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap p-2">{formatInTimeZone(r.createdAt, admin.org.timezone, "d MMM HH:mm")}</td>
                <td className="p-2">{nameOf(r.actorId)}</td>
                <td className="p-2">{r.action}</td>
                <td className="p-2">
                  {r.targetType} {r.targetId.slice(0, 8)}
                </td>
                <td className="max-w-md break-all p-2 text-xs text-muted">{r.details ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
