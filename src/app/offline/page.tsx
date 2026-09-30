import { t } from "@/i18n";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-semibold">{t.app.name}</h1>
      <p className="mt-2">{t.app.offline}</p>
    </main>
  );
}
