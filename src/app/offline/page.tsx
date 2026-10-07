import { t } from "@/i18n";
import { AuthShell } from "@/components/brand";

export const metadata = { title: "Offline" };
// Rendered per request so the page carries the script nonce of its own response.
export const dynamic = "force-dynamic";

export default function OfflinePage() {
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">{t.app.name}</h1>
      <p className="mt-2">{t.app.offline}</p>
    </AuthShell>
  );
}
