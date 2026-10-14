import { NextResponse } from "next/server";
import { z } from "zod";
import { reverseGeocode } from "@/lib/geo/provider";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";

const q = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

// POST, not GET: see the search route.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!rateLimit(`rev:${user.id}`, 20, 60_000)) return new NextResponse(null, { status: 429 });
  const parsed = q.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  try {
    return NextResponse.json({ label: await reverseGeocode(parsed.data) });
  } catch (err) {
    console.warn(`[geo] reverse failed: ${(err as Error).name} ${(err as Error).message}`);
    return NextResponse.json({ label: `${parsed.data.lat.toFixed(4)}, ${parsed.data.lng.toFixed(4)}` }, { status: 503 });
  }
}
