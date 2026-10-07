import Link from "next/link";
import { t, fmt } from "@/i18n";
import { db } from "@/lib/db";
import { legalVars } from "@/lib/legal";
import { BsbLogo } from "@/components/brand";
import { Alert } from "@/components/ui";

export const metadata = { title: t.terms.title };
export const dynamic = "force-dynamic";

// Terms of use: what the service is, the driver's own responsibilities, cost
// sharing, conduct, and how reports and suspensions work. Wording in
// src/i18n/en.ts (terms); the fuller draft for the lawyer is docs/legal/TERMS_DRAFT.md.
export default async function TermsPage() {
  const org = await db.organisation.findFirst();
  const vars = legalVars(org?.name);
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/" aria-label={t.app.name} className="mb-6 inline-block">
        <BsbLogo tile className="h-16 w-auto" />
      </Link>
      <h1 className="mb-4 text-[1.7rem] font-bold leading-tight">{t.terms.title}</h1>
      <Alert kind="warn">{t.terms.draft}</Alert>
      {t.terms.sections.map((s) => (
        <section key={s.title} className="mt-6">
          <h2 className="mb-2 text-lg font-bold">{s.title}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
            {s.items.map((x) => (
              <li key={x}>{fmt(x, vars)}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="mt-8 text-sm">
        <Link href="/privacy" className="underline">
          {t.privacy.title}
        </Link>
      </p>
    </main>
  );
}
