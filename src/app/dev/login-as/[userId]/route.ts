import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isDevConvenienceEnabled } from "@/lib/env";
import { signIn } from "@/lib/auth";
import { devMailbox } from "@/lib/mail";

export const dynamic = "force-dynamic";

// Switch into any user without email: exercises both sides of request → accept →
// confirm flows. Guarded by NODE_ENV=development && PILOT_MODE !== 'true'.
export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  if (!isDevConvenienceEnabled()) return new NextResponse(null, { status: 404 });
  const { userId } = await ctx.params;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return new NextResponse("No such user", { status: 404 });
  // Reuse the magic-link machinery and consume the link the mailbox just captured.
  await signIn("nodemailer", { email: user.email, redirect: false });
  const mail = devMailbox().find((m) => m.to.toLowerCase() === user.email.toLowerCase());
  const link = mail?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) return new NextResponse("No magic link captured", { status: 500 });
  return NextResponse.redirect(link);
}
