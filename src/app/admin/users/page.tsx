import { t, fmt } from "@/i18n";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Alert, Badge, Button, Card, PageTitle, Textarea } from "@/components/ui";
import { deleteUserAction, inviteAction, setRoleAction, suspendAction } from "../actions";

export const metadata = { title: t.admin.users };
export const dynamic = "force-dynamic";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ invited?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const users = await db.user.findMany({
    where: { orgId: admin.orgId },
    // Only what an administrator needs to manage access. How far someone got,
    // when they were last active and whether they carpool is not the employer's business.
    select: { id: true, name: true, email: true, role: true, status: true, isSeed: true, onboardingCompletedAt: true },
    orderBy: [{ isSeed: "asc" }, { createdAt: "desc" }],
  });
  const invitations = await db.invitation.findMany({ where: { orgId: admin.orgId, usedAt: null }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageTitle>{t.admin.users}</PageTitle>
      {sp.invited && <Alert kind="success">{fmt(t.admin.invited, { n: sp.invited })}</Alert>}
      <Card className="mb-4">
        <h2 className="font-medium">{t.admin.invite}</h2>
        <p className="text-sm text-muted">{t.admin.inviteHelp}</p>
        <form action={inviteAction} className="mt-2">
          <label htmlFor="emails" className="sr-only">
            {t.admin.invite}
          </label>
          <Textarea id="emails" name="emails" rows={4} required placeholder="anna@school.be, ben@school.be" />
          <div className="mt-2">
            <Button type="submit">{t.admin.invite}</Button>
          </div>
        </form>
        {invitations.length > 0 && <p className="mt-2 text-xs text-muted">{t.admin.ui.pendingInvitations}: {invitations.map((i) => i.email).join(", ")}</p>}
      </Card>
      {/* File downloads served by a route handler, so plain anchors are correct here. */}
      <p className="mb-2 text-sm">
        <a className="underline" href="/admin/export/users" download>
          {t.admin.exports}: users
        </a>{" "}
        · <a className="underline" href="/admin/export/matches" download>matches</a> · <a className="underline" href="/admin/export/trips" download>trips</a> ·{" "}
        <a className="underline" href="/admin/export/survey" download>survey</a>
      </p>
      <p className="mb-2 text-xs text-muted">{t.admin.ui.exportNote}</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              {([["name"], ["email"], ["role"], ["status"], ["onboarded"], ["actions"]] as const).map(([k]) => (
                <th key={k} className="p-2">
                  {t.admin.ui.cols[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="p-2">
                  {u.name || "—"}
                  {u.isSeed && <Badge>{t.admin.ui.seed}</Badge>}
                </td>
                <td className="p-2">{u.email}</td>
                <td className="p-2">{u.role}</td>
                <td className="p-2">
                  <Badge tone={u.status === "ACTIVE" ? "ok" : "danger"}>{u.status}</Badge>
                </td>
                <td className="p-2">{u.onboardingCompletedAt ? t.admin.ui.yes : t.admin.ui.no}</td>
                <td className="p-2">
                  {u.id !== admin.id && (
                    <div className="flex flex-wrap gap-1">
                      <form action={suspendAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="status" value={u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
                        {u.status === "ACTIVE" && (
                          <label>
                            <span className="sr-only">{t.admin.suspendReason}</span>
                            <select name="reason" required defaultValue="" className="mr-1 rounded border border-border bg-surface px-1 py-0.5 text-xs">
                              <option value="" disabled>
                                {t.admin.suspendReason}
                              </option>
                              {Object.entries(t.admin.suspendReasons).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <button type="submit" className="underline">
                          {u.status === "ACTIVE" ? t.admin.suspend : t.admin.unsuspend}
                        </button>
                      </form>
                      <form action={setRoleAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="role" value={u.role === "ADMIN" ? "MEMBER" : "ADMIN"} />
                        <button type="submit" className="underline">
                          {u.role === "ADMIN" ? t.admin.ui.makeMember : t.admin.ui.makeAdmin}
                        </button>
                      </form>
                      <form action={deleteUserAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <button type="submit" className="text-danger underline">
                          {t.admin.deleteUser}
                        </button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
