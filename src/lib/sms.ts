import { env, isDevConvenienceEnabled } from "./env";
import { devMailbox } from "./mail";

export const smsConfigured = () => Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);

// Belgian numbers as people type them (0470 12 34 56) become E.164 (+32470123456);
// anything already starting with + is kept. Returns null when it cannot be a number.
export function normalisePhone(raw: string): string | null {
  const s = raw.replace(/[\s().-]/g, "");
  const m = /^(\+|00)?(\d{8,15})$/.exec(s);
  if (!m) return null;
  if (m[1]) return `+${m[2]}`;
  if (s.startsWith("0")) return `+32${s.slice(1)}`;
  return `+${s}`;
}

// Twilio's REST API over fetch: no SDK to install. Throws when the message
// cannot be sent, so callers can show an honest error.
export async function sendSms(to: string, body: string): Promise<void> {
  if (isDevConvenienceEnabled()) {
    console.log(`\n[sms] to=${to}\n${body}\n`);
    const box = devMailbox();
    box.unshift({ to, subject: "SMS", text: body, sentAt: new Date().toISOString() });
    if (box.length > 50) box.length = 50;
    if (!smsConfigured()) return;
  }
  if (!smsConfigured()) throw new Error("SMS is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: body }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
