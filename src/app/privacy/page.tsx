import Link from "next/link";
import { t, fmt } from "@/i18n";
import { db } from "@/lib/db";
import { legalVars } from "@/lib/legal";
import { BsbLogo } from "@/components/brand";
import { Alert } from "@/components/ui";

export const metadata = { title: t.privacy.title };
export const dynamic = "force-dynamic";

// GDPR Art. 13 notice. The wording lives in src/i18n/en.ts (privacy.sections);
// the numbers come from the code (retention periods, group sizes) and the
// controller's identity from the environment, so the notice cannot drift from
// what the app does. Bump the version in /admin/settings after editing.
export default async function PrivacyPage() {
  const org = await db.organisation.findFirst();
  const vars = legalVars(org?.name);
  const s = t.privacy.sections;
  const f = (x: string) => fmt(x, vars);
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/" aria-label={t.app.name} className="mb-6 inline-block">
        <BsbLogo tile className="h-16 w-auto" />
      </Link>
      <h1 className="text-[1.7rem] font-bold leading-tight">{t.privacy.title}</h1>
      <p className="mb-4 text-muted">
        {fmt(t.privacy.version, { version: org?.policyVersion ?? "1" })} · {f(t.privacy.subtitle)}
      </p>
      <Alert kind="warn">{t.privacy.draft}</Alert>
      <Section title={s.controller}>
        <p>{f(s.controllerBody)}</p>
        <p>{f(s.controllerRole)}</p>
      </Section>
      <Section title={s.who}>
        <p>{f(s.whoBody)}</p>
      </Section>
      <Section title={s.store}>
        <List items={s.storeItems.map(f)} />
      </Section>
      <Section title={s.why}>
        <List items={s.whyItems.map(f)} />
      </Section>
      <Section title={s.sees}>
        <List items={s.seesItems.map(f)} />
      </Section>
      <Section title={s.goes}>
        <List items={s.goesItems.map(f)} />
      </Section>
      <Section title={s.keep}>
        <List items={s.keepItems.map(f)} />
      </Section>
      <Section title={s.rights}>
        <List items={s.rightsItems.map(f)} />
      </Section>
      <Section title={s.choices}>
        <List items={s.choicesItems.map(f)} />
      </Section>
      <Section title={s.security}>
        <p>{f(s.securityBody)}</p>
      </Section>
      <Section title={s.changes}>
        <p>{f(s.changesBody)}</p>
      </Section>
      <p className="mt-8 text-sm">
        <Link href="/terms" className="underline">
          {t.terms.title}
        </Link>
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}
