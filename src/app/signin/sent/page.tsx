import { t, fmt } from "@/i18n";
import { isDevConvenienceEnabled } from "@/lib/env";

export const metadata = { title: t.auth.checkEmailTitle };

export default async function SentPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = "" } = await searchParams;
  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-semibold">{t.auth.checkEmailTitle}</h1>
      <p className="mt-2">{fmt(t.auth.checkEmailBody, { email })}</p>
      {isDevConvenienceEnabled() && <p className="mt-4 text-sm text-muted">{t.auth.devLinkHint}</p>}
    </main>
  );
}
