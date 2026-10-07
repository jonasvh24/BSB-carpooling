import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env, isDevConvenienceEnabled } from "@/lib/env";
import { signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Switch into any user without a password: exercises both sides of request → accept →
// confirm flows. Guarded by NODE_ENV=development && PILOT_MODE !== 'true', here and
// again inside the Credentials provider.
export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  if (!isDevConvenienceEnabled()) return new NextResponse(null, { status: 404 });
  const { userId } = await ctx.params;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return new NextResponse("No such user", { status: 404 });
  await signIn("credentials", { devUserId: user.id, redirect: false });
  // Behind the tunnel the incoming request is plain http; AUTH_URL is the public address.
  return NextResponse.redirect(new URL("/", env.AUTH_URL));
}
