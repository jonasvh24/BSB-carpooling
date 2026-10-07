"use client";

import { useActionState } from "react";
import { ownerSignIn, requestSignIn, type OwnerState, type SignInState } from "./actions";
import { t } from "@/i18n";
import { Alert, Button, Field, Input } from "@/components/ui";

const errorText: Record<NonNullable<NonNullable<SignInState>["error"]>, string> = {
  invalid: t.auth.notAllowed,
  notAllowed: t.auth.notAllowed,
  suspended: t.auth.suspended,
  rateLimited: t.auth.rateLimited,
  sendFailed: t.auth.sendFailed,
};

export function SignInForm() {
  const [state, action, pending] = useActionState(requestSignIn, null);
  return (
    <form action={action} noValidate>
      {state?.error && <Alert kind="error">{errorText[state.error]}</Alert>}
      <Field label={t.auth.emailLabel} htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder={t.auth.emailPlaceholder}
          aria-describedby={state?.error ? "email-error" : undefined}
        />
      </Field>
      <Button type="submit" full disabled={pending}>
        {t.auth.submit}
      </Button>
    </form>
  );
}

// Shown only when an owner account is configured in .env.
export function OwnerSignInForm() {
  const [state, action, pending] = useActionState<OwnerState, FormData>(ownerSignIn, null);
  return (
    <details className="mt-6 border-t border-border pt-4 text-sm" open={Boolean(state?.error)}>
      <summary className="cursor-pointer text-muted">{t.auth.ownerTitle}</summary>
      <form action={action} className="mt-3">
        {state?.error && <Alert kind="error">{state.error === "rateLimited" ? t.auth.rateLimited : t.auth.ownerWrong}</Alert>}
        <Field label={t.auth.ownerEmail} htmlFor="owner-email">
          <Input id="owner-email" name="email" type="email" autoComplete="username" required />
        </Field>
        <Field label={t.auth.ownerPassword} htmlFor="owner-password">
          <Input id="owner-password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" variant="secondary" full disabled={pending}>
          {t.auth.ownerSubmit}
        </Button>
      </form>
    </details>
  );
}
