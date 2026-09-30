import Link from "next/link";
import { t } from "@/i18n";
import { signOut } from "@/lib/auth";
import { BrandLockup } from "./brand";

const icons = {
  matches: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM4 20a8 8 0 0 1 16 0",
  pools: "M5 13l1.6-4.4A2 2 0 0 1 8.5 7.3h7a2 2 0 0 1 1.9 1.3L19 13M4 13h16v4H4zM7 17v2M17 17v2",
  schedule: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  notifications: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 20a2 2 0 0 0 4 0",
  settings: "M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4",
};

const items = [
  { href: "/matches", label: t.nav.matches, icon: icons.matches },
  { href: "/pools", label: t.nav.pools, icon: icons.pools },
  { href: "/schedule", label: t.nav.schedule, icon: icons.schedule },
  { href: "/notifications", label: t.nav.notifications, icon: icons.notifications },
  { href: "/settings", label: t.nav.settings, icon: icons.settings },
];

// One list of links, laid out twice by CSS: a thumb-reach tab bar fixed to the
// bottom of a phone, and inline in the navy header from the md breakpoint up.
export function AppNav({ isAdmin, unread, current }: { isAdmin: boolean; unread: number; current?: string }) {
  return (
    <header className="sticky top-0 z-30 bg-navy text-on-navy shadow-md">
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="shrink-0 rounded-md">
          <BrandLockup />
        </Link>
        <ul className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] text-muted shadow-[0_-4px_16px_-8px_rgb(41_47_76/0.25)] md:static md:ml-4 md:flex md:gap-1 md:border-0 md:bg-transparent md:pb-0 md:text-on-navy-muted md:shadow-none">
          {items.map((i) => {
            const active = current?.startsWith(i.href);
            return (
              <li key={i.href}>
                <a
                  href={i.href}
                  aria-current={active ? "page" : undefined}
                  className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[0.68rem] font-semibold aria-[current=page]:text-accent md:min-h-0 md:flex-row md:gap-0 md:rounded-full md:px-3.5 md:py-2 md:text-sm md:hover:bg-white/10 md:hover:text-on-navy md:aria-[current=page]:bg-white/15 md:aria-[current=page]:text-on-navy"
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 md:hidden" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={i.icon} />
                  </svg>
                  {i.label}
                  {i.href === "/notifications" && unread > 0 && (
                    <span className="absolute right-[22%] top-1.5 rounded-full bg-accent px-1.5 text-[0.65rem] leading-4 text-accent-text md:static md:ml-1.5">{unread}</span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
        <div className="ml-auto flex items-center gap-1 text-sm">
          {isAdmin && (
            <a href="/admin" className="whitespace-nowrap rounded-full px-3 py-2 font-semibold text-gold hover:bg-white/10">
              {t.nav.admin}
            </a>
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" className="whitespace-nowrap rounded-full px-3 py-2 text-on-navy-muted hover:bg-white/10 hover:text-on-navy">
              {t.nav.signOut}
            </button>
          </form>
        </div>
      </nav>
    </header>
  );
}
