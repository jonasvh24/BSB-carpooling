"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveConsent, type StepState } from "@/app/(app)/onboarding/actions";
import { t } from "@/i18n";
import { Alert } from "@/components/ui";
import { StepActions } from "./shell";

export function ConsentForm({ reconsent, policyVersion }: { reconsent: boolean; policyVersion: string }) {
  const [state, action, pending] = useActionState<StepState, FormData>(saveConsent, null);
  const [loc, setLoc] = useState(false);
  const [res, setRes] = useState(false);
  const c = t.onboarding.consent;
  return (
    <form action={action}>
      {reconsent && (
        <Alert kind="warn">
          <strong>{c.reconsentTitle}</strong> {c.reconsentBody}
        </Alert>
      )}
      {state?.errors && <Alert kind="error">{c.bothRequired}</Alert>}
      <h2 className="text-lg font-medium">{c.summaryTitle}</h2>
      <ul className="mt-2 mb-4 list-disc space-y-1 pl-5 text-sm">
        {c.summary.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mb-4 text-sm">
        <Link href="/privacy" className="underline" target="_blank">
          {t.privacy.title}
        </Link>{" "}
        <span className="text-muted">(v{policyVersion})</span>
      </p>
      <label className="mb-3 flex items-start gap-3 rounded-lg border border-border bg-surface p-3">
        <input type="checkbox" name="location" checked={loc} onChange={(e) => setLoc(e.target.checked)} className="mt-1 h-5 w-5 accent-accent" required />
        <span>{c.location}</span>
      </label>
      <label className="mb-3 flex items-start gap-3 rounded-lg border border-border bg-surface p-3">
        <input type="checkbox" name="research" checked={res} onChange={(e) => setRes(e.target.checked)} className="mt-1 h-5 w-5 accent-accent" required />
        <span>{c.research}</span>
      </label>
      <p className="text-sm text-muted mb-4">{c.bothRequired}</p>
      <h2 className="text-lg font-medium">{c.rulesTitle}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {c.rules.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <StepActions pending={pending || !loc || !res} label={c.submit} />
    </form>
  );
}
