import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { t } from "@/i18n";
import { LinkButton } from "@/components/ui";
import { BsbLogo } from "@/components/brand";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(user.onboardingCompletedAt ? "/matches" : "/onboarding");
  return (
    <main id="main" className="min-h-dvh">
      <section className="hero-navy px-5 pb-28 pt-8">
        <div className="mx-auto max-w-3xl">
          <BsbLogo tone="white" full className="h-16 w-auto sm:h-20" />
          <p className="mt-10 text-sm font-semibold uppercase tracking-[0.18em] text-gold">
            {t.app.name} · {t.home.eyebrow}
          </p>
          <h1 className="mt-3 max-w-xl text-4xl font-bold leading-[1.1] sm:text-5xl">{t.home.headline}</h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-on-navy-muted">{t.home.lead}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <LinkButton href="/signin" className="px-7 py-3 text-lg">
              {t.home.cta}
            </LinkButton>
            <p className="text-sm text-on-navy-muted">{t.home.staffOnly}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto -mt-16 max-w-3xl px-5 pb-12">
        <ol className="grid gap-4 sm:grid-cols-3">
          {t.home.steps.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
              <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-text">
                {i + 1}
              </span>
              <h2 className="mt-3 text-lg font-bold">{s.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 rounded-2xl border border-gold bg-gold-soft px-4 py-3 text-sm text-on-gold">{t.home.privacyNote}</p>
        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/privacy" className="underline">
            {t.nav.privacy}
          </Link>
        </p>
      </section>
    </main>
  );
}
