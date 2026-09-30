import { t } from "@/i18n";
import { AuthShell } from "@/components/brand";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">{t.app.name}</h1>
      <p className="mt-2">{t.app.offline}</p>
    </AuthShell>
  );
}
