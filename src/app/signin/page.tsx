import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { t } from "@/i18n";
import { SignInForm } from "./form";

export const metadata = { title: t.auth.title };

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-semibold">{t.auth.title}</h1>
      <p className="mt-1 mb-6 text-muted">{t.auth.intro}</p>
      <SignInForm />
    </main>
  );
}
