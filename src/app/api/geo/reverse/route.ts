import { NextResponse } from "next/server";
import { z } from "zod";
import { reverseGeocode } from "@/lib/geo/provider";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";

const q = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!rateLimit(`rev:${user.id}`, 20, 60_000)) return new NextResponse(null, { status: 429 });
  const sp = new URL(req.url).searchParams;
  const parsed = q.safeParse({ lat: sp.get("lat"), lng: sp.get("lng") });
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  try {
    return NextResponse.json({ label: await reverseGeocode(parsed.data) });
  } catch {
    return NextResponse.json({ label: `${parsed.data.lat.toFixed(4)}, ${parsed.data.lng.toFixed(4)}` });
  }
}
