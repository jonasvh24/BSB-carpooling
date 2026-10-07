// Next.js calls register() once per server start; the scheduler lives here.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { isPublicUrl, isLocalSmtp } = await import("./lib/mail");
    const { env } = await import("./lib/env");
    if (isPublicUrl(env.AUTH_URL) && isLocalSmtp(env.SMTP_HOST)) {
      console.warn(
        `[mail] AUTH_URL is public (${env.AUTH_URL}) but SMTP_HOST is ${env.SMTP_HOST}: sign-in emails will NOT reach anyone. Set SMTP_* in .env (see .env.example).`,
      );
    }
  }
  // On Netlify, DISABLE_CRON=true and netlify/functions/job-*.mts call /api/jobs instead.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DISABLE_CRON !== "true") {
    const { startScheduler } = await import("./lib/jobs/scheduler");
    await startScheduler().catch((e) => console.error("[cron] failed to start", e));
  }
}
