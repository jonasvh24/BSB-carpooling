"use client";

import Link from "next/link";
import { useActionState } from "react";
import { completePasswordReset, completeSignup, passwordSignIn, requestPasswordReset, requestSignupCode, type ForgotState, type SignInState, type SignUpState } from "./actions";
import { t } from "@/i18n";
import { Alert, Button, Field, Input } from "@/components/ui";

const signInErrors: Record<NonNullable<NonNullable<SignInState>["error"]>, string> = {
  invalid: t.auth.wrong,
  wrong: t.auth.wrong,
  suspended: t.auth.suspended,
  rateLimited: t.auth.rateLimited,
};

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(passwordSignIn, null);
  return (
    <form action={action} noValidate>
      {state?.error && <Alert kind="error">{signInErrors[state.error]}</Alert>}
      <Field label={t.auth.emailLabel} htmlFor="email">
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="username" required placeholder={t.auth.emailPlaceholder} />
      </Field>
      <Field label={t.auth.passwordLabel} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" full disabled={pending}>
        {t.auth.submit}
      </Button>
      <p className="mt-3 text-center text-sm">
        <Link href="/signin/forgot" className="underline">
          {t.auth.forgot}
        </Link>
      </p>
      <p className="mt-6 text-center text-sm">
        {t.auth.newHere}{" "}
        <Link href="/signin/new" className="font-semibold underline">
          {t.auth.createAccount}
        </Link>
      </p>
    </form>
  );
}

const signUpErrors = {
  invalid: t.auth.invalidEmail,
  short: t.auth.passwordShort,
  mismatch: t.auth.passwordMismatch,
  badPhone: t.auth.badPhone,
  notAllowed: t.auth.notAllowed,
  exists: t.auth.exists,
  suspended: t.auth.suspended,
  rateLimited: t.auth.rateLimited,
  sendFailed: t.auth.emailFailed,
  wrongCode: t.auth.wrongCode,
};

// Two steps in one component, like the password reset: the address stays in the action
// state, never in the URL. No password is asked for until the code arrives.
export function SignUpForm() {
  const [state, requestAction, requesting] = useActionState<SignUpState, FormData>(requestSignupCode, null);
  const [state2, completeAction, completing] = useActionState<SignUpState, FormData>(completeSignup, null);
  const current = state2 ?? state;
  if (current?.step === "code") {
    return (
      <form action={completeAction} noValidate>
        <input type="hidden" name="email" value={current.email} />
        <p className="mb-4">{t.auth.signupCodeSent}</p>
        {current.error && <Alert kind="error">{signUpErrors[current.error]}</Alert>}
        <Field label={t.auth.codeLabel} htmlFor="code">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
        </Field>
        <Field label={t.auth.newPasswordLabel} htmlFor="password" help={t.auth.passwordHint}>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label={t.auth.confirmPasswordLabel} htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label={t.auth.phoneLabel} htmlFor="phone" help={t.auth.phoneHelp} optional>
          <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0470 12 34 56" />
        </Field>
        <Button type="submit" full disabled={completing}>
          {t.auth.createAccount}
        </Button>
      </form>
    );
  }
  return (
    <form action={requestAction} noValidate>
      {current?.error && <Alert kind="error">{signUpErrors[current.error]}</Alert>}
      <Field label={t.auth.emailLabel} htmlFor="email" help={t.auth.emailHint}>
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="username" required placeholder={t.auth.emailPlaceholder} />
      </Field>
      <Button type="submit" full disabled={requesting}>
        {t.auth.emailMeCode}
      </Button>
      <p className="mt-6 text-center text-sm">
        {t.auth.haveAccount}{" "}
        <Link href="/signin" className="font-semibold underline">
          {t.auth.title}
        </Link>
      </p>
    </form>
  );
}

const forgotErrors = {
  invalid: t.auth.invalidEmail,
  rateLimited: t.auth.rateLimited,
  noPhone: t.auth.noPhone,
  sendFailed: t.auth.smsFailed,
  wrongCode: t.auth.wrongCode,
  short: t.auth.passwordShort,
  mismatch: t.auth.passwordMismatch,
};

// Two steps in one component: the address stays in the action state, never in the URL.
export function ForgotForm() {
  const [state, requestAction, requesting] = useActionState<ForgotState, FormData>(requestPasswordReset, null);
  const [state2, completeAction, completing] = useActionState<ForgotState, FormData>(completePasswordReset, null);
  const current = state2 ?? state;
  if (current?.step === "code") {
    return (
      <form action={completeAction} noValidate>
        <input type="hidden" name="email" value={current.email} />
        <p className="mb-4">{t.auth.codeSent}</p>
        {current.error && <Alert kind="error">{forgotErrors[current.error]}</Alert>}
        <Field label={t.auth.codeLabel} htmlFor="code">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
        </Field>
        <Field label={t.auth.newPasswordLabel} htmlFor="password" help={t.auth.passwordHint}>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label={t.auth.confirmPasswordLabel} htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Button type="submit" full disabled={completing}>
          {t.auth.setNewPassword}
        </Button>
      </form>
    );
  }
  return (
    <form action={requestAction} noValidate>
      {current?.error && <Alert kind="error">{forgotErrors[current.error]}</Alert>}
      <Field label={t.auth.emailLabel} htmlFor="email" help={t.auth.forgotHelp}>
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="username" required placeholder={t.auth.emailPlaceholder} />
      </Field>
      <Button type="submit" full disabled={requesting}>
        {t.auth.sendCode}
      </Button>
      <p className="mt-6 text-center text-sm">
        <Link href="/signin" className="underline">
          {t.auth.backToSignIn}
        </Link>
      </p>
    </form>
  );
}
