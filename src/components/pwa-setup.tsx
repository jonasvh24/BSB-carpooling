"use client";

import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { Button } from "./ui";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Registers the app-shell service worker and shows an install banner on the
// second visit (first visits are for finding out whether the app is useful).
export function PwaSetup() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    let visits = 0;
    try {
      visits = Number(localStorage.getItem("visits") ?? "0") + 1;
      localStorage.setItem("visits", String(visits));
    } catch {}
    const dismissed = (() => {
      try {
        return localStorage.getItem("installDismissed") === "1";
      } catch {
        return false;
      }
    })();
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
      if (visits >= 2 && !dismissed) setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!show || !prompt) return null;
  return (
    <div role="region" aria-label="Install" className="fixed inset-x-0 bottom-0 border-t border-border bg-surface p-3 shadow-lg">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <p className="flex-1 text-sm">{t.app.installBanner}</p>
        <Button
          variant="secondary"
          onClick={() => {
            try {
              localStorage.setItem("installDismissed", "1");
            } catch {}
            setShow(false);
          }}
        >
          {t.app.installDismiss}
        </Button>
        <Button
          onClick={async () => {
            await prompt.prompt();
            setShow(false);
          }}
        >
          {t.app.installAction}
        </Button>
      </div>
    </div>
  );
}
