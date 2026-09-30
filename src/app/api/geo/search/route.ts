import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { geocode } from "@/lib/geo/provider";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!rateLimit(`geo:${user.id}`, 60, 60_000)) return new NextResponse(null, { status: 429 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const site = await db.site.findFirst({ where: { orgId: user.orgId, active: true }, select: { lat: true, lng: true } });
  try {
    const hits = await geocode(q, site ?? undefined);
    return NextResponse.json(hits);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
