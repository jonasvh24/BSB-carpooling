import { t } from "@/i18n";
import { LinkButton } from "@/components/ui";
import { AuthShell } from "@/components/brand";

export const metadata = { title: t.auth.errorTitle };

export default async function ErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error = "" } = await searchParams;
  const message =
    error === "NotAllowed" || error === "AccessDenied"
      ? t.auth.notAllowed
      : error === "Suspended"
        ? t.auth.suspended
        : t.auth.invalidLink;
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">{t.auth.errorTitle}</h1>
      <p role="alert" className="mt-2">
        {message}
      </p>
      <div className="mt-6">
        <LinkButton href="/signin">{t.auth.tryAgain}</LinkButton>
      </div>
    </AuthShell>
  );
}
