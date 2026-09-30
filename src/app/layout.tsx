import type { Metadata, Viewport } from "next";
import "./globals.css";
import { t } from "@/i18n";
import { PwaSetup } from "@/components/pwa-setup";

export const metadata: Metadata = {
  title: { default: t.app.name, template: `%s · ${t.app.name}` },
  description: t.app.tagline,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: t.app.name },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b6e63",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh">
        <a href="#main" className="skip-link">
          {t.app.skipToContent}
        </a>
        {children}
        <PwaSetup />
      </body>
    </html>
  );
}
