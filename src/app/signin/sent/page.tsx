import { t, fmt } from "@/i18n";
import { isDevConvenienceEnabled } from "@/lib/env";
import { AuthShell } from "@/components/brand";

export const metadata = { title: t.auth.checkEmailTitle };

export default async function SentPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = "" } = await searchParams;
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">{t.auth.checkEmailTitle}</h1>
      <p className="mt-2">{fmt(t.auth.checkEmailBody, { email })}</p>
      {isDevConvenienceEnabled() && <p className="mt-4 text-sm text-muted">{t.auth.devLinkHint}</p>}
    </AuthShell>
  );
}
