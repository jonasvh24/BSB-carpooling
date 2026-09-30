import Link from "next/link";
import { t } from "@/i18n";
import { BSB_LETTERS, BSB_SWOOSH, BSB_TAGLINE } from "./brand-paths";

// The school logo. `tone` picks the lettering colour for the background it sits
// on; `full` adds the "The British School of Brussels" tagline, which is only
// legible at larger sizes.
export function BsbLogo({ tone = "navy", full = false, className }: { tone?: "navy" | "white"; full?: boolean; className?: string }) {
  const ink = tone === "white" ? "#ffffff" : "#241e4f";
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={full ? "0 23 148 54" : "0 23 106 54"} role="img" aria-label={t.brand.school} className={className}>
      <path fill={ink} d={BSB_LETTERS} />
      {full && <path fill={ink} d={BSB_TAGLINE} />}
      <path fill="#c11f1b" d={BSB_SWOOSH} />
    </svg>
  );
}

// Logo plus product name, for the navy header bars.
export function BrandLockup() {
  return (
    <span className="flex items-center gap-2.5">
      <BsbLogo tone="white" className="h-9 w-auto" />
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
            <BsbLogo tone="white" full className="h-20 w-auto" />
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
        </p>
      </main>
    </div>
  );
}
