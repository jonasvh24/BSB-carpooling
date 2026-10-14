import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { geocode } from "@/lib/geo/provider";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";

// POST, not GET: the typed address must not end up in URLs, which servers, tunnels
// and proxies log.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!rateLimit(`geo:${user.id}`, 60, 60_000)) return new NextResponse(null, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { q?: unknown };
  const q = typeof body.q === "string" ? body.q.slice(0, 200) : "";
  const site = await db.site.findFirst({ where: { orgId: user.orgId, active: true }, select: { lat: true, lng: true } });
  try {
    const hits = await geocode(q, site ?? undefined);
    return NextResponse.json(hits);
  } catch (err) {
    // Status and error name only (for example "Photon 403", "TimeoutError"): the query is personal data.
    console.warn(`[geo] search failed: ${(err as Error).name} ${(err as Error).message}`);
    // 503, not an empty list: the form then asks Photon from the browser (photon-browser.ts),
    // and says the search is down only if that fails too.
    return NextResponse.json([], { status: 503 });
  }
}
