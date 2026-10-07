import { t } from "@/i18n";
import { isDevConvenienceEnabled } from "@/lib/env";
import { AuthShell } from "@/components/brand";

export const metadata = { title: t.auth.checkEmailTitle };

export const dynamic = "force-dynamic";

export default function SentPage() {
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">{t.auth.checkEmailTitle}</h1>
      <p className="mt-2">{t.auth.checkEmailBody}</p>
      {isDevConvenienceEnabled() && <p className="mt-4 text-sm text-muted">{t.auth.devLinkHint}</p>}
    </AuthShell>
  );
}
