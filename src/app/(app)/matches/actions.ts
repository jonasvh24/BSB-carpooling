"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { notify } from "@/lib/notify";
import { t, fmt } from "@/i18n";
import { formatDays } from "@/lib/enums";

export async function dismissMatch(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const m = await db.match.findUnique({ where: { id } });
  if (!m || (m.driverId !== user.id && m.passengerId !== user.id)) return;
  await db.match.update({
    where: { id },
    data: { status: m.driverId === user.id ? "DISMISSED_BY_DRIVER" : "DISMISSED_BY_PASSENGER" },
  });
  revalidatePath("/matches");
}

const requestSchema = z.object({
  matchId: z.string().min(1),
  days: z.array(z.coerce.number().int().min(1).max(7)).min(1),
  message: z.string().trim().max(300).optional().or(z.literal("")),
});

export type RequestState = { error?: string; ok?: boolean } | null;

// §7.1: a passenger asks to join, a driver invites. Either way one PoolRequest.
export async function sendRequest(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const user = await requireUser();
  if (!rateLimit(`request:${user.id}`, 20, 60 * 60 * 1000)) return { error: t.auth.rateLimited };
  const parsed = requestSchema.safeParse({
    matchId: formData.get("matchId"),
    days: formData.getAll("days"),
    message: formData.get("message") ?? "",
  });
  if (!parsed.success) return { error: t.app.somethingWentWrong };
  const m = await db.match.findUnique({ where: { id: parsed.data.matchId } });
  if (!m || (m.driverId !== user.id && m.passengerId !== user.id)) return { error: t.app.forbidden };
  const toUserId = m.driverId === user.id ? m.passengerId : m.driverId;
  const blocked = await db.block.findFirst({ where: { OR: [{ blockerId: user.id, blockedId: toUserId }, { blockerId: toUserId, blockedId: user.id }] } });
  if (blocked) return { error: t.app.forbidden };
  const existing = await db.poolRequest.findFirst({
    where: { status: "PENDING", direction: m.direction, OR: [{ fromUserId: user.id, toUserId }, { fromUserId: toUserId, toUserId: user.id }] },
  });
  if (existing) return { ok: true };

  // If the driver already has a pool for this direction the request targets it.
  const driverId = m.driverId;
  const pool = await db.pool.findFirst({
    where: { direction: m.direction, status: { in: ["ACTIVE", "PAUSED", "FORMING"] }, members: { some: { userId: driverId, memberRole: "DRIVER", status: "ACTIVE" } } },
  });
  const days = parsed.data.days.filter((d) => m.sharedDays.split(",").map(Number).includes(d));
  if (days.length === 0) return { error: t.app.somethingWentWrong };

  await db.poolRequest.create({
    data: {
      poolId: pool?.id ?? null,
      fromUserId: user.id,
      toUserId,
      direction: m.direction,
      days: formatDays(days),
      message: parsed.data.message || null,
    },
  });
  const dayNames = days.map((d) => t.weekdays.short[d]).join(", ");
  await notify(toUserId, "REQUEST_RECEIVED", {
    title: fmt(t.notifications.requestReceivedTitle, { name: user.name }),
    body: fmt(t.notifications.requestReceivedBody, { direction: m.direction === "AM" ? t.matches.am : t.matches.pm, days: dayNames }),
    link: "/requests",
  });
  revalidatePath("/matches");
  revalidatePath("/requests");
  return { ok: true };
}
