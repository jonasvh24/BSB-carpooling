import type { Metadata, Viewport } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";
import { t } from "@/i18n";
import { PwaSetup } from "@/components/pwa-setup";

// Open Sans is the typeface of the school website.
const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-open-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: t.app.name, template: `%s · ${t.app.name}` },
  description: t.app.tagline,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: t.app.name },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#292f4c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={openSans.variable}>
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
