import { db } from "./db";
import { sendMail } from "./mail";
import { zonedHour } from "./time";
import type { NotificationKind } from "./enums";
import { env } from "./env";
import { t } from "@/i18n";

// One plain template for every notification email: title, body, button, footer.
export function renderEmail(content: { title: string; body: string }, link: string): { text: string; html: string } {
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = `${content.title}\n\n${content.body}\n\n${link}\n\n${t.app.name} · ${t.email.footer}`;
  const html = `<!doctype html><html lang="en-GB"><body style="margin:0;background:#f3f4f8;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#292f4c">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #d5d9de;border-radius:12px"><tr><td style="padding:24px">
<p style="margin:0 0 8px;font-size:13px;color:#5a6470">${esc(t.app.name)}</p>
<h1 style="margin:0 0 12px;font-size:20px">${esc(content.title)}</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5">${esc(content.body).replace(/\n/g, "<br>")}</p>
<a href="${link}" style="display:inline-block;background:#c11f1b;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">${esc(t.email.open)}</a>
<p style="margin:20px 0 0;font-size:12px;color:#5a6470">${esc(t.email.footer)}<br><a href="${env.AUTH_URL}/settings" style="color:#5a6470">${esc(t.email.settings)}</a></p>
</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

// In-app notification plus email, honouring the user's mute setting and the
// 22:00–07:00 quiet hours. Driver cancellations always go out (§8.1).
export async function notify(
  userId: string,
  kind: NotificationKind,
  content: { title: string; body: string; link?: string },
) {
  const user = await db.user.findUnique({ where: { id: userId }, include: { org: { select: { timezone: true } } } });
  if (!user || user.status !== "ACTIVE") return;
  const n = await db.notification.create({ data: { userId, kind, title: content.title, body: content.body, link: content.link ?? null } });
  const urgent = kind === "DRIVER_CANCELLED";
  if (!urgent && user.muteEmail) return;
  const hour = zonedHour(user.org.timezone);
  if (!urgent && (hour >= 22 || hour < 7)) return; // sent by the morning digest sweep instead
  await sendEmailFor(user.email, n.id, content);
}

async function sendEmailFor(to: string, notificationId: string, content: { title: string; body: string; link?: string }) {
  const link = content.link ? `${env.AUTH_URL.replace(/\/$/, "")}${content.link}` : env.AUTH_URL;
  try {
    await sendMail({ to, subject: content.title, ...renderEmail(content, link) });
    await db.notification.update({ where: { id: notificationId }, data: { emailedAt: new Date() } });
  } catch (err) {
    console.warn(`[notify] email failed: ${(err as Error).message}`);
  }
}

// Called at 07:00 by the scheduler: deliver anything held back during quiet hours.
export async function flushQuietHoursEmail() {
  const held = await db.notification.findMany({
    where: { emailedAt: null, createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) }, kind: { not: "DRIVER_CANCELLED" } },
    include: { user: true },
  });
  for (const n of held) {
    if (n.user.muteEmail || n.user.status !== "ACTIVE") continue;
    await sendEmailFor(n.user.email, n.id, { title: n.title, body: n.body, link: n.link ?? undefined });
  }
}
