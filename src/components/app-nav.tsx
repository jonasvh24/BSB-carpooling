import Link from "next/link";
import { t } from "@/i18n";
import { signOut } from "@/lib/auth";

const items = [
  { href: "/matches", label: t.nav.matches },
  { href: "/pools", label: t.nav.pools },
  { href: "/schedule", label: t.nav.schedule },
  { href: "/notifications", label: t.nav.notifications },
  { href: "/settings", label: t.nav.settings },
];

export function AppNav({ isAdmin, unread, current }: { isAdmin: boolean; unread: number; current?: string }) {
  return (
    <nav aria-label="Main" className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-3xl items-center gap-1 overflow-x-auto px-2 py-1 text-sm">
        <Link href="/" className="px-2 py-2 font-semibold">
          {t.app.name}
        </Link>
        {items.map((i) => (
          <a
            key={i.href}
            href={i.href}
            aria-current={current?.startsWith(i.href) ? "page" : undefined}
            className="whitespace-nowrap rounded-md px-2 py-2 hover:bg-surface-2 aria-[current=page]:bg-surface-2 aria-[current=page]:font-medium"
          >
            {i.label}
            {i.href === "/notifications" && unread > 0 && (
              <span className="ml-1 rounded-full bg-accent px-1.5 text-xs text-accent-text">{unread}</span>
            )}
          </a>
        ))}
        {isAdmin && (
          <a href="/admin" className="whitespace-nowrap rounded-md px-2 py-2 hover:bg-surface-2">
            {t.nav.admin}
          </a>
        )}
        <form
          className="ml-auto"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className="whitespace-nowrap rounded-md px-2 py-2 hover:bg-surface-2">
            {t.nav.signOut}
          </button>
        </form>
      </div>
    </nav>
  );
}
