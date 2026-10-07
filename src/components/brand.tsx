import Link from "next/link";
import { t } from "@/i18n";

// The carpool logo supplied by the pilot owner (public/brand). The plain file has
// a transparent background for the navy bars; `tile` is the same artwork on its
// own navy, for light backgrounds.
export function BsbLogo({ tile = false, className }: { tile?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tile ? "/brand/bsb-carpool-tile.png" : "/brand/bsb-carpool.png"}
      width={tile ? 900 : 832}
      height={tile ? 503 : 412}
      alt={t.brand.logoAlt}
      className={tile ? `rounded-xl ${className ?? ""}` : className}
    />
  );
}

// Logo plus product name, for the navy header bars.
export function BrandLockup() {
  return (
    <span className="flex items-center gap-2.5">
      <BsbLogo className="h-9 w-auto" />
      <span className="border-l border-white/25 pl-2.5 text-[0.95rem] font-semibold tracking-tight text-on-navy">{t.app.name}</span>
    </span>
  );
}

// Signed-out pages share this frame: navy band with the logo, content in a card.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div className="hero-navy px-4 pb-24 pt-10">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <Link href="/" aria-label={t.app.name}>
            <BsbLogo className="h-24 w-auto" />
          </Link>
          <p className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-gold">{t.app.name}</p>
        </div>
      </div>
      <main id="main" className="mx-auto -mt-16 max-w-md px-4 pb-12">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">{children}</div>
        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/privacy" className="underline">
            {t.nav.privacy}
          </Link>
          {" · "}
          <Link href="/terms" className="underline">
            {t.nav.terms}
          </Link>
        </p>
      </main>
    </div>
  );
}
