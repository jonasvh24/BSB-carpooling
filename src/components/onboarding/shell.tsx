import Link from "next/link";
import { t, fmt } from "@/i18n";
import { TOTAL_STEPS } from "@/lib/validation/onboarding";

// Wizard chrome: progress, heading, back link. Steps are numbered 1..7 after sign-in.
export function WizardShell({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-accent">{fmt(t.onboarding.stepOf, { n: step, total: TOTAL_STEPS })}</p>
      <progress className="mb-5 h-2 w-full" value={step} max={TOTAL_STEPS} aria-label={t.onboarding.title} />
      <h1 className="mb-5 text-[1.7rem] font-bold leading-tight">{title}</h1>
      {children}
      <div className="mt-6 flex items-center justify-between text-sm text-muted">
        {step > 1 ? (
          <Link href={`/onboarding?step=${step - 1}`} className="underline">
            {t.app.back}
          </Link>
        ) : (
          <span />
        )}
        <span>{t.onboarding.progressSaved}</span>
      </div>
    </div>
  );
}

export function StepActions({ pending, label, returnTo }: { pending: boolean; label?: string; returnTo?: string }) {
  return (
    <div className="mt-6">
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full min-h-11 items-center justify-center rounded-full bg-accent px-5 py-2.5 text-base font-semibold text-accent-text shadow-sm hover:bg-accent-strong disabled:opacity-50"
      >
        {label ?? (returnTo ? t.app.save : t.app.next)}
      </button>
    </div>
  );
}
