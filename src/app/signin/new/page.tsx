import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { t } from "@/i18n";
import { SignUpForm } from "../form";
import { AuthShell } from "@/components/brand";

export const metadata = { title: t.auth.createAccount };

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">{t.auth.createAccount}</h1>
      <p className="mt-1 mb-6 text-muted">{t.auth.createIntro}</p>
      <SignUpForm />
    </AuthShell>
  );
}
