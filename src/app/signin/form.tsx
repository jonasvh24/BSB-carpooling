"use client";

import { useActionState } from "react";
import { requestSignIn, type SignInState } from "./actions";
import { t } from "@/i18n";
import { Alert, Button, Field, Input } from "@/components/ui";

const errorText: Record<NonNullable<NonNullable<SignInState>["error"]>, string> = {
  invalid: t.auth.notAllowed,
  notAllowed: t.auth.notAllowed,
  suspended: t.auth.suspended,
  rateLimited: t.auth.rateLimited,
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
