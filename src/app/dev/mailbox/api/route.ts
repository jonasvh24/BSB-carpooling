import { NextResponse } from "next/server";
import { devMailbox } from "@/lib/mail";
import { isDevConvenienceEnabled } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  if (!isDevConvenienceEnabled()) return new NextResponse(null, { status: 404 });
  const to = new URL(req.url).searchParams.get("to")?.toLowerCase();
  const mails = devMailbox().filter((m) => !to || m.to.toLowerCase() === to);
  return NextResponse.json(mails);
}
