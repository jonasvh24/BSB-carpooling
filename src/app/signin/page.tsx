import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { t } from "@/i18n";
import { OwnerSignInForm, SignInForm } from "./form";
import { ownerLoginEnabled } from "./actions";
import { AuthShell } from "@/components/brand";

export const metadata = { title: t.auth.title };

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">{t.auth.title}</h1>
      <p className="mt-1 mb-6 text-muted">{t.auth.intro}</p>
      <SignInForm />
      {(await ownerLoginEnabled()) && <OwnerSignInForm />}
    </AuthShell>
  );
}
