import { db } from "./db";

// Attempt limits for everything that guards an account: password sign-in, sign-up
// codes and reset codes. Counted in the database because on Netlify each request can
// land on a different function instance, so an in-memory counter (rate-limit.ts)
// would reset constantly and an attacker could guess without limit.

export const LIMITS = {
  // Failed passwords. Per address stops guessing one account; per network address
  // stops spraying many accounts. The network limit is generous because the whole
  // campus shares one public address at 08:00.
  signInPerEmail: { limit: 10, windowMs: 15 * 60 * 1000 },
  signInPerIp: { limit: 50, windowMs: 15 * 60 * 1000 },
  // Code emails sent, and wrong codes entered.
  codeSendPerEmail: { limit: 3, windowMs: 15 * 60 * 1000 },
  codeSendPerIp: { limit: 20, windowMs: 15 * 60 * 1000 },
  codeTriesPerEmail: { limit: 5, windowMs: 15 * 60 * 1000 },
} as const;

type Limit = { limit: number; windowMs: number };

export async function isLimited(key: string, { limit, windowMs }: Limit): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  return (await db.rateLimitHit.count({ where: { key, createdAt: { gte: since } } })) >= limit;
}

export async function recordHit(key: string): Promise<void> {
  await db.rateLimitHit.create({ data: { key } });
}

// Records the attempt and reports whether it was still within the limit.
export async function takeHit(key: string, limit: Limit): Promise<boolean> {
  if (await isLimited(key, limit)) return false;
  await recordHit(key);
  return true;
}

export async function clearHits(key: string): Promise<void> {
  await db.rateLimitHit.deleteMany({ where: { key } });
}

// Netlify sets x-nf-client-connection-ip from the TCP connection; x-forwarded-for can
// carry client-supplied entries, so it is only the fallback (local and other hosts).
// Returns null when unknown: an "unknown" bucket would lump every user together.
export function clientIpFrom(headers: Headers | undefined | null): string | null {
  if (!headers) return null;
  const nf = headers.get("x-nf-client-connection-ip")?.trim();
  if (nf) return nf;
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || null;
}

const signInKeys = (email: string, ip: string | null) => ({ email: `signin:${email}`, ip: ip ? `signin-ip:${ip}` : null });

export async function signInBlocked(email: string, ip: string | null): Promise<boolean> {
  const k = signInKeys(email, ip);
  if (await isLimited(k.email, LIMITS.signInPerEmail)) return true;
  return k.ip ? isLimited(k.ip, LIMITS.signInPerIp) : false;
}

export async function recordSignInFailure(email: string, ip: string | null): Promise<void> {
  const k = signInKeys(email, ip);
  await recordHit(k.email);
  if (k.ip) await recordHit(k.ip);
}

// A correct password clears the per-address count, so a colleague who mistyped a few
// times is not left one attempt from a lockout. The network count stays.
export async function clearSignInFailures(email: string): Promise<void> {
  await clearHits(signInKeys(email, null).email);
}
