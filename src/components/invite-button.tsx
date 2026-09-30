"use client";

import { useState } from "react";
import { t, fmt } from "@/i18n";
import { Button } from "./ui";

// Web Share where available (phones), clipboard otherwise.
export function InviteButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const text = fmt(t.matches.inviteText, { app: t.app.name, url });
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="secondary"
        onClick={async () => {
          if (navigator.share) {
            try {
              await navigator.share({ title: t.app.name, text, url });
              return;
            } catch {}
          }
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {}
        }}
      >
        {t.matches.invite}
      </Button>
      {copied && (
        <span role="status" className="text-sm text-muted">
          {t.matches.inviteCopied}
        </span>
      )}
    </div>
  );
}
