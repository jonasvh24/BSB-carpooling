import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../src/lib/db";
import { addDaysIso } from "../src/lib/time";

// Loads a school year's holidays into NonWorkingDay for every organisation.
//   npx tsx scripts/seed-term-dates.ts [prisma/term-dates/bsb-2026-2027.json]
// Re-runnable: existing rows keep their date and get the label from the file.
type File = { ranges: Array<{ from: string; to: string; label: string }> };

async function main() {
  const file = process.argv[2] ?? "prisma/term-dates/bsb-2026-2027.json";
  const data = JSON.parse(readFileSync(resolve(file), "utf8")) as File;
  const orgs = await db.organisation.findMany({ select: { id: true, name: true } });
  for (const org of orgs) {
    let n = 0;
    for (const r of data.ranges) {
      for (let d = r.from; d <= r.to; d = addDaysIso(d, 1)) {
        await db.nonWorkingDay.upsert({ where: { orgId_date: { orgId: org.id, date: d } }, create: { orgId: org.id, date: d, label: r.label }, update: { label: r.label } });
        n++;
      }
    }
    console.log(`${org.name}: ${n} non-working days from ${file}`);
  }
}

main().finally(() => db.$disconnect());
