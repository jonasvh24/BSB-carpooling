"use client";

import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { Button } from "./ui";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Registers the app-shell service worker and shows an install banner when the
// browser offers installation. The only thing kept on the device is the user's
// own "not now" choice; nothing is counted.
export function PwaSetup() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
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
      if (!dismissed) setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!show || !prompt) return null;
  return (
    <div role="region" aria-label="Install" className="fixed inset-x-0 bottom-14 z-40 border-t border-border bg-surface p-3 shadow-lg md:bottom-0">
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
