// Next.js calls register() once per server start; the scheduler lives here.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DISABLE_CRON !== "true") {
    const { startScheduler } = await import("./lib/jobs/scheduler");
    await startScheduler().catch((e) => console.error("[cron] failed to start", e));
  }
}
