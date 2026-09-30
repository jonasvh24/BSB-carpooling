import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { exportUserData } from "@/lib/gdpr";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const data = await exportUserData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
