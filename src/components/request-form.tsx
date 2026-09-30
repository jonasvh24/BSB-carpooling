"use client";

import { useActionState, useState } from "react";
import { sendRequest, type RequestState } from "@/app/(app)/matches/actions";
import { t } from "@/i18n";
import { Alert, Button, Field, Textarea } from "./ui";

// "Ask to join" / "Invite": days pre-filled with the shared days, optional message.
export function RequestForm({ matchId, sharedDays, label }: { matchId: string; sharedDays: number[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<RequestState, FormData>(sendRequest, null);
  if (state?.ok) return <span className="text-sm text-ok">{t.matches.requestSent}</span>;
  if (!open) return <Button onClick={() => setOpen(true)}>{label}</Button>;
  return (
    <form action={action} className="w-full rounded-lg border border-border bg-surface-2 p-3">
      <h3 className="font-medium mb-2">{t.matches.requestTitle}</h3>
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="matchId" value={matchId} />
      <fieldset className="mb-3">
        <legend className="text-sm text-muted mb-1">{t.matches.requestDays}</legend>
        <div className="flex flex-wrap gap-2">
          {sharedDays.map((d) => (
            <label key={d} className="flex min-h-11 items-center gap-1 rounded-lg border border-border bg-surface px-3">
              <input type="checkbox" name="days" value={d} defaultChecked className="h-4 w-4 accent-accent" />
              {t.weekdays.short[d]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={t.matches.requestMessage} htmlFor={`msg-${matchId}`} optional>
        <Textarea id={`msg-${matchId}`} name="message" rows={2} maxLength={300} placeholder={t.matches.requestMessagePlaceholder} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {t.matches.requestSubmit}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t.app.cancel}
        </Button>
      </div>
    </form>
  );
}
