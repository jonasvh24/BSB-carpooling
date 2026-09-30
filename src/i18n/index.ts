import { en } from "./en";

export const t = en;

// Tiny interpolation helper: fmt(t.auth.checkEmailBody, { email }).
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
