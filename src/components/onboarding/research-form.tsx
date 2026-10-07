"use client";

import { useActionState } from "react";
import { saveResearch, type StepState } from "@/app/(app)/onboarding/actions";
import { t } from "@/i18n";
import { Alert, ChoiceGroup, Field, Input, Textarea } from "@/components/ui";
import { StepActions } from "./shell";

type Props = { initial: Record<string, string | number>; returnTo?: string };

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));

export function ResearchForm({ initial, returnTo }: Props) {
  const [state, action, pending] = useActionState<StepState, FormData>(saveResearch, null);
  const r = t.onboarding.research;
  const v = (k: string) => (initial[k] != null ? String(initial[k]) : undefined);
  return (
    <form action={action}>
      <p className="mb-4 text-muted">{r.intro}</p>
      {state?.errors && <Alert kind="error">{t.app.required}: {Object.keys(state.errors).join(", ").toUpperCase()}</Alert>}
      <ChoiceGroup name="r1" legend={r.r1} columns={2} value={v("r1")} options={opts(r.r1o)} />
      <Field label={r.r2} htmlFor="r2">
        <Input id="r2" name="r2" type="number" inputMode="numeric" min={0} max={300} required defaultValue={v("r2")} />
      </Field>
      <ChoiceGroup name="r3" legend={r.r3} columns={3} value={v("r3")} options={opts(r.r3o)} />
      <ChoiceGroup name="r4" legend={r.r4} columns={3} value={v("r4")} options={opts(r.r4o)} />
      <ChoiceGroup name="r5" legend={r.r5} columns={2} value={v("r5")} options={opts(r.r5o)} />
      <ChoiceGroup name="r6" legend={r.r6} columns={2} value={v("r6")} options={opts(r.r6o)} />
      <ChoiceGroup name="r7" legend={r.r7} help={r.r7Help} columns={3} value={v("r7")} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} />
      <ChoiceGroup name="r8" legend={r.r8} columns={3} value={v("r8")} options={opts(r.r8o)} />
      <ChoiceGroup name="r9" legend={r.r9} value={v("r9")} options={opts(r.r9o)} />
      <Field label={r.r10} htmlFor="r10" optional>
        <Textarea id="r10" name="r10" rows={3} maxLength={500} defaultValue={v("r10")} />
      </Field>
      <StepActions pending={pending} returnTo={returnTo} />
      {/* Optional step: skipping posts the form without validating or storing the answers. */}
      <button type="submit" name="skip" value="1" formNoValidate disabled={pending} className="mt-3 min-h-11 w-full rounded-full border border-border bg-surface px-5 py-2.5 text-base font-semibold hover:bg-surface-2">
        {r.skip}
      </button>
    </form>
  );
}
