import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isDevConvenienceEnabled } from "@/lib/env";
import { recomputeOrg } from "@/lib/matching-service";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDevConvenienceEnabled()) return new NextResponse(null, { status: 404 });
  const orgs = await db.organisation.findMany({ select: { id: true } });
  const out = [];
  for (const o of orgs) out.push(await recomputeOrg(o.id));
  return NextResponse.json(out.map((r) => ({ matches: r.matches, ms: r.ms })));
}
