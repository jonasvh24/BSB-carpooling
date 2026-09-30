import "dotenv/config";
import { db } from "../src/lib/db";
import { recomputeOrg } from "../src/lib/matching-service";

// npm run recompute — full recompute for every organisation.
async function main() {
  const orgs = await db.organisation.findMany({ select: { id: true, name: true } });
  for (const org of orgs) {
    const r = await recomputeOrg(org.id);
    console.log(`${org.name}: ${r.matches} matches, ${r.routeCalls} route calls, ${r.ms} ms`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
