import type { Config } from "@netlify/functions";

// Schedules are UTC; Brussels is UTC+1/+2, so "0 8 * * 1" lands at the hour the in-process
// scheduler used (src/lib/jobs/scheduler.ts), give or take summer time.
const run = async () => {
  const base = process.env.AUTH_URL ?? process.env.URL ?? "";
  const res = await fetch(`${base}/api/jobs?run=weekly-joined`, { method: "POST", headers: { "x-jobs-secret": process.env.JOBS_SECRET ?? "" } });
  console.log("job weekly-joined", res.status, (await res.text()).slice(0, 500));
};

export default run;

export const config: Config = { schedule: "0 8 * * 1" };
