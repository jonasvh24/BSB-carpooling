import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" | "ghost"; full?: boolean };

export function Button({ variant = "primary", full, className, ...props }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-base font-semibold min-h-11 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
  const styles = {
    primary: "bg-accent text-accent-text shadow-sm hover:bg-accent-strong",
    secondary: "bg-surface text-text border border-border hover:bg-surface-2",
    danger: "bg-danger text-white hover:opacity-90",
    ghost: "bg-transparent text-text hover:bg-surface-2",
  }[variant];
  return <button className={cx(base, styles, full && "w-full", className)} {...props} />;
}

export function LinkButton({
  href,
  variant = "primary",
  children,
  className,
  full,
}: {
  href: string;
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
  className?: string;
  full?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-base font-semibold min-h-11 transition-colors";
  const styles = {
    primary: "bg-accent text-accent-text shadow-sm hover:bg-accent-strong",
    secondary: "bg-surface text-text border border-border hover:bg-surface-2",
    ghost: "bg-transparent text-text hover:bg-surface-2",
  }[variant];
  return (
    <Link href={href} className={cx(base, styles, full && "w-full", className)}>
      {children}
    </Link>
  );
}

export function Card({ children, className, as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "article" | "div" | "li" }) {
  return <Tag className={cx("rounded-2xl border border-border bg-surface p-5 shadow-card", className)}>{children}</Tag>;
}

export function Field({
  label,
  htmlFor,
  help,
  error,
  children,
  optional,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  error?: string;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="block text-base font-semibold mb-1">
        {label}
        {optional && <span className="text-muted font-normal"> (optional)</span>}
      </label>
      {help && (
        <p id={`${htmlFor}-help`} className="text-sm text-muted mb-1">
          {help}
        </p>
      )}
      {children}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-danger mt-1">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base min-h-12 placeholder:text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cx("w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base placeholder:text-muted", className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cx("w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base min-h-12", className)}
      {...props}
    />
  );
}

// A group of radio buttons rendered as large tappable chips. Works without JavaScript.
export function ChoiceGroup({
  name,
  legend,
  options,
  value,
  help,
  multiple,
  onChange,
  columns,
}: {
  name: string;
  legend: string;
  options: Array<{ value: string; label: string }>;
  value?: string | string[];
  help?: string;
  multiple?: boolean;
  onChange?: (v: string) => void;
  columns?: 2 | 3;
}) {
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return (
    <fieldset className="mb-4">
      <legend className="text-base font-semibold mb-1">{legend}</legend>
      {help && <p className="text-sm text-muted mb-2">{help}</p>}
      <div className={cx("grid gap-2", columns === 3 ? "grid-cols-3" : columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
        {options.map((o) => {
          const id = `${name}-${o.value}`;
          const checked = selected.has(o.value);
          return (
            <label
              key={o.value}
              htmlFor={id}
              className={cx(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 min-h-11 cursor-pointer transition-colors has-[:checked]:border-navy has-[:checked]:bg-surface-2 has-[:checked]:font-semibold",
                checked ? "border-navy bg-surface-2 font-semibold" : "border-border bg-surface",
              )}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                id={id}
                name={name}
                value={o.value}
                checked={onChange ? checked : undefined}
                defaultChecked={onChange ? undefined : checked}
                onChange={onChange ? () => onChange(o.value) : undefined}
                className="h-4 w-4 accent-navy"
              />
              <span>{o.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warn"; children: ReactNode }) {
  const styles = {
    info: "border-border bg-surface-2",
    error: "border-danger bg-accent-soft text-danger",
    success: "border-ok bg-ok-soft text-ok",
    warn: "border-gold bg-gold-soft text-on-gold",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cx("rounded-xl border px-3.5 py-2.5 mb-4 text-sm", styles)}>
      {children}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="text-[1.7rem] font-bold leading-tight">{children}</h1>
      {sub && <p className="text-muted mt-1">{sub}</p>}
    </header>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" | "accent" }) {
  const styles = {
    neutral: "bg-surface-2 text-text",
    ok: "bg-ok-soft text-ok",
    warn: "bg-gold-soft text-on-gold",
    danger: "bg-accent-soft text-danger",
    accent: "bg-navy text-on-navy",
  }[tone];
  return <span className={cx("inline-block rounded-full px-2.5 py-1 text-xs font-semibold", styles)}>{children}</span>;
}

export function Definition({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 border-b border-border last:border-0">
      <dt className="text-muted">{term}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
