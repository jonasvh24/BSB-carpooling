import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { t } from "@/i18n";
import { LinkButton } from "@/components/ui";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(user.onboardingCompletedAt ? "/matches" : "/onboarding");
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
      <h1 className="text-3xl font-semibold">{t.app.name}</h1>
      <p className="mt-2 text-lg text-muted">{t.app.tagline}</p>
      <div className="mt-8">
        <LinkButton href="/signin" full>
          {t.auth.title}
        </LinkButton>
      </div>
      <p className="mt-8 text-sm">
        <a href="/privacy" className="underline">
          {t.nav.privacy}
        </a>
      </p>
    </main>
  );
}
