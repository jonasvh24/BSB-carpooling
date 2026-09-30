import { t } from "@/i18n";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { formatInTimeZone } from "date-fns-tz";
import { markAllRead } from "./actions";

export const metadata = { title: t.notifications.title };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <PageTitle>{t.notifications.title}</PageTitle>
        {items.some((n) => !n.readAt) && (
          <form action={markAllRead}>
            <button type="submit" className="min-h-11 text-sm underline">
              {t.notifications.markAllRead}
            </button>
          </form>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-muted">{t.notifications.none}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {items.map((n) => (
            <li key={n.id} className={n.readAt ? "" : "bg-surface-2"}>
              <a href={n.link ?? "/notifications"} className="block px-4 py-3">
                <p className="font-medium">{n.title}</p>
                <p className="text-sm">{n.body}</p>
                <p className="mt-1 text-xs text-muted">{formatInTimeZone(n.createdAt, user.org.timezone, "EEE d MMM HH:mm")}</p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
