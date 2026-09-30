import { t, fmt } from "@/i18n";
import { db } from "@/lib/db";

export const metadata = { title: t.privacy.title };
export const dynamic = "force-dynamic";

// §9.10: plain-language notice generated from the privacy rules, versioned with
// the organisation's policyVersion. The wording lives in src/i18n/en.ts (privacy.sections)
// so the pilot owner edits it there; bump the version in /admin/settings afterwards.
export default async function PrivacyPage() {
  const org = await db.organisation.findFirst();
  const vars = { app: t.app.name, org: org?.name ?? "the school" };
  const s = t.privacy.sections;
  const f = (x: string) => fmt(x, vars);
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{t.privacy.title}</h1>
      <p className="text-muted">
        {fmt(t.privacy.version, { version: org?.policyVersion ?? "1" })} · {f(t.privacy.subtitle)}
      </p>
      <Section title={s.who}>
        <p>{f(s.whoBody)}</p>
      </Section>
      <Section title={s.store}>
        <List items={s.storeItems.map(f)} />
      </Section>
      <Section title={s.sees}>
        <List items={s.seesItems.map(f)} />
      </Section>
      <Section title={s.goes}>
        <p>{f(s.goesBody)}</p>
      </Section>
      <Section title={s.keep}>
        <List items={s.keepItems.map(f)} />
      </Section>
      <Section title={s.choices}>
        <List items={s.choicesItems.map(f)} />
      </Section>
      <Section title={s.security}>
        <p>{f(s.securityBody)}</p>
      </Section>
      <Section title={s.contact}>
        <p>{f(s.contactBody)}</p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-medium">{title}</h2>
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
