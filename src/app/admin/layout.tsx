import Link from "next/link";
import { headers } from "next/headers";
import { t } from "@/i18n";
import { requireAdmin } from "@/lib/session";
import { BrandLockup } from "@/components/brand";

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
      <nav aria-label={t.admin.title} className="sticky top-0 z-30 bg-navy text-on-navy-muted shadow-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 overflow-x-auto px-4 text-sm">
          <Link href="/matches" className="mr-3 shrink-0 rounded-md">
            <BrandLockup />
          </Link>
          {items.map(([href, label]) => (
            <a
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
              className="whitespace-nowrap rounded-full px-3 py-2 font-semibold hover:bg-white/10 hover:text-on-navy aria-[current=page]:bg-white/15 aria-[current=page]:text-on-navy"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>
      <main id="main" className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        {children}
      </main>
    </>
  );
}
