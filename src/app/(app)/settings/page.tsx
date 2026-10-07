import Link from "next/link";
import { t } from "@/i18n";
import { requireUser } from "@/lib/session";
import { Alert, Button, Card, PageTitle } from "@/components/ui";
import { setMuteAction } from "./actions";
import { Email } from "@/components/email";

export const metadata = { title: t.settings.title };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  return (
    <>
      <PageTitle>{t.settings.title}</PageTitle>
      {sp.saved && <Alert kind="success">{t.app.saved}</Alert>}
      <Card className="mb-4">
        <h2 className="font-medium">{t.settings.email}</h2>
        <p className="text-sm text-muted"><Email address={user.email} /></p>
        <form action={setMuteAction} className="mt-3">
          <label className="flex items-start gap-2">
            <input type="checkbox" name="muteEmail" defaultChecked={user.muteEmail} className="mt-1 h-4 w-4 accent-navy" />
            <span>
              <span className="block">{t.settings.muteEmail}</span>
              <span className="block text-sm text-muted">{t.settings.muteEmailHelp}</span>
            </span>
          </label>
          <div className="mt-3">
            <Button type="submit" variant="secondary">
              {t.app.save}
            </Button>
          </div>
        </form>
      </Card>
      <ul className="space-y-2">
        <li>
          <Link href="/profile" className="underline">
            {t.profile.title}
          </Link>
        </li>
        <li>
          <Link href="/settings/privacy" className="underline">
            {t.settings.privacy}
          </Link>
        </li>
        <li>
          <Link href="/settings/report" className="underline">
            {t.settings.reportTitle} / {t.settings.blocked}
          </Link>
        </li>
        <li>
          <Link href="/privacy" className="underline">
            {t.privacy.title}
          </Link>
        </li>
        <li>
          <Link href="/terms" className="underline">
            {t.terms.title}
          </Link>
        </li>
      </ul>
    </>
  );
}
