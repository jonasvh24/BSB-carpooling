import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { t } from "@/i18n";
import { ForgotForm } from "../form";
import { AuthShell } from "@/components/brand";

export const metadata = { title: t.auth.forgot };

export default async function ForgotPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">{t.auth.forgot}</h1>
      <p className="mt-1 mb-6 text-muted">{t.auth.forgotIntro}</p>
      <ForgotForm />
    </AuthShell>
  );
}
