import { t, fmt } from "@/i18n";
import type { Reason } from "./matching/types";

const LANG: Record<string, string> = { nl: "Dutch", fr: "French", en: "English" };

// Reasons are stored as codes so they can be localised; this renders one.
export function renderReason(r: Reason): string {
  const p = { ...(r.params ?? {}) } as Record<string, string | number>;
  if (r.code === "language" && typeof p.lang === "string") p.lang = LANG[p.lang] ?? p.lang;
  const template = t.reasons[r.code];
  return template ? fmt(template, p) : r.code;
}
