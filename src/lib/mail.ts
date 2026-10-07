import nodemailer from "nodemailer";
import { env, isDevConvenienceEnabled } from "./env";

export type MailMessage = { to: string; subject: string; text: string; html?: string; sentAt: string };

let transport: nodemailer.Transporter | null = null;

export const isPublicUrl = (url: string) => /^https:\/\//.test(url) && !/localhost|127\.0\.0\.1/.test(url);
export const isLocalSmtp = (host: string) => /^(localhost|127\.0\.0\.1|mailpit)$/i.test(host);

// Development-only in-memory mailbox, read by /dev/mailbox and the e2e tests.
// Never populated in pilot mode or production.
const globalBox = globalThis as unknown as { devMailbox?: MailMessage[] };
export const devMailbox = (): MailMessage[] => (globalBox.devMailbox ??= []);

function getTransport() {
  if (transport) return transport;
  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transport;
}

export async function sendMail(opts: { to: string; subject: string; text: string; html?: string }) {
  if (isDevConvenienceEnabled()) {
    // Developers rarely have SMTP running; the console copy is the primary channel.
    console.log(`\n[mail] to=${opts.to} subject=${opts.subject}\n${opts.text}\n`);
    const box = devMailbox();
    box.unshift({ ...opts, sentAt: new Date().toISOString() });
    if (box.length > 50) box.length = 50;
  }
  if (isPublicUrl(env.AUTH_URL) && isLocalSmtp(env.SMTP_HOST)) {
    // Reachable from the internet but mail only goes to a local inbox: nobody outside this
    // machine would receive the message, so do not pretend it was sent (the console/dev mailbox
    // copy above still lets the developer pick the link up).
    throw new Error(`SMTP_HOST is ${env.SMTP_HOST} while AUTH_URL is public; configure real SMTP`);
  }
  try {
    await getTransport().sendMail({ from: env.EMAIL_FROM, ...opts });
  } catch (err) {
    // A missing Mailpit must not break sign-in in development. In pilot mode, in production,
    // or whenever the app is reachable on a public URL, SMTP is required: a swallowed error
    // here would show "Check your email" to a colleague who will never receive anything.
    if (env.PILOT_MODE || process.env.NODE_ENV === "production" || isPublicUrl(env.AUTH_URL)) throw err;
    console.warn(`[mail] SMTP delivery failed (${(err as Error).message}); console copy only.`);
  }
}
