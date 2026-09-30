import Link from "next/link";
import { headers } from "next/headers";
import { t } from "@/i18n";
import { requireAdmin } from "@/lib/session";

const items = [
  ["/admin", t.admin.dashboard],
  ["/admin/users", t.admin.users],
  ["/admin/sites", t.admin.sites],
  ["/admin/holidays", t.admin.holidays],
  ["/admin/surveys", t.admin.surveys],
  ["/admin/reports", t.admin.reports],
  ["/admin/settings", t.admin.settings],
  ["/admin/audit", t.admin.audit],
] as const;

// ADMIN only; every page under here is scoped to the admin's organisation.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const path = (await headers()).get("x-pathname") ?? "";
  return (
    <>
      <nav aria-label={t.admin.title} className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-2 py-1 text-sm">
          <Link href="/matches" className="px-2 py-2 font-semibold">
            {t.app.name}
          </Link>
          {items.map(([href, label]) => (
            <a
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
              className="whitespace-nowrap rounded-md px-2 py-2 hover:bg-surface-2 aria-[current=page]:bg-surface-2 aria-[current=page]:font-medium"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>
      <main id="main" className="mx-auto max-w-5xl px-4 py-4 pb-16">
        {children}
      </main>
    </>
  );
}
