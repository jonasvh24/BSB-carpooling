"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isDriver, isMember, leavePool, setMeetingPoint, setMemberDays, setPoolStatus, setRotation } from "@/lib/pools/service";
import { applyExceptionToTrips } from "@/lib/pools/trips";
import { notify } from "@/lib/notify";
import { DATE_RE } from "@/lib/time";
import { t, fmt } from "@/i18n";
import { rateLimit } from "@/lib/rate-limit";

async function memberOr403(poolId: string, userId: string) {
  if (!(await isMember(poolId, userId))) redirect("/pools");
}
async function driverOr403(poolId: string, userId: string) {
  if (!(await isDriver(poolId, userId))) redirect(`/pools/${poolId}`);
}

export async function sendMessageAction(formData: FormData) {
  const user = await requireUser();
  const poolId = String(formData.get("poolId") ?? "");
  await memberOr403(poolId, user.id);
  const body = String(formData.get("body") ?? "").trim().slice(0, 1000);
  if (!body || !rateLimit(`msg:${user.id}`, 60, 60 * 60 * 1000)) return;
  await db.message.create({ data: { poolId, userId: user.id, body } });
  revalidatePath(`/pools/${poolId}`);
}

export async function cantMakeItAction(formData: FormData) {
  const user = await requireUser();
  const poolId = String(formData.get("poolId") ?? "");
  await memberOr403(poolId, user.id);
  const date = z.string().regex(DATE_RE).safeParse(formData.get("date"));
  if (!date.success) return;
  await db.scheduleException.upsert({
    where: { userId_date: { userId: user.id, date: date.data } },
    create: { userId: user.id, date: date.data, kind: "OFF", note: String(formData.get("note") ?? "").slice(0, 120) || null },
    update: { kind: "OFF" },
  });
  await applyExceptionToTrips(user.id, date.data);
  const others = await db.poolMember.findMany({ where: { poolId, status: "ACTIVE", userId: { not: user.id } } });
  for (const o of others) {
    await notify(o.userId, "POOL_PLAN_CHANGED", { title: t.notifications.planChangedTitle, body: fmt(t.pools.cantMakeItNotice, { name: user.name, date: date.data }), link: `/pools/${poolId}` });
  }
  revalidatePath(`/pools/${poolId}`);
  redirect(`/pools/${poolId}?noted=1`);
}

export async function leaveAction(formData: FormData) {
  const user = await requireUser();
  const poolId = String(formData.get("poolId") ?? "");
  await memberOr403(poolId, user.id);
  await leavePool(poolId, user.id);
  revalidatePath("/pools");
  redirect("/pools");
}

const mpSchema = z.object({ userId: z.string().min(1), lat: z.coerce.number(), lng: z.coerce.number(), label: z.string().trim().min(1).max(60) });

export async function meetingPointAction(formData: FormData) {
  const user = await requireUser();
  const poolId = String(formData.get("poolId") ?? "");
  await driverOr403(poolId, user.id);
  const userId = String(formData.get("userId") ?? "");
  if (formData.get("clear")) {
    await setMeetingPoint(poolId, userId, null);
  } else {
    const parsed = mpSchema.safeParse({ userId, lat: formData.get("lat"), lng: formData.get("lng"), label: formData.get("label") });
    if (!parsed.success) return;
    await setMeetingPoint(poolId, parsed.data.userId, { lat: parsed.data.lat, lng: parsed.data.lng, label: parsed.data.label });
  }
  revalidatePath(`/pools/${poolId}`);
}

export async function memberDaysAction(formData: FormData) {
  const user = await requireUser();
  const poolId = String(formData.get("poolId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  // Drivers may change anyone's days; members their own.
  if (userId !== user.id) await driverOr403(poolId, user.id);
  else await memberOr403(poolId, user.id);
  const days = formData.getAll("days").map(Number).filter((d) => d >= 1 && d <= 7);
  if (days.length === 0) return;
  await setMemberDays(poolId, userId, days);
  revalidatePath(`/pools/${poolId}`);
}

export async function pauseAction(formData: FormData) {
  const user = await requireUser();
  const poolId = String(formData.get("poolId") ?? "");
  await driverOr403(poolId, user.id);
  await setPoolStatus(poolId, formData.get("status") === "ACTIVE" ? "ACTIVE" : "PAUSED");
  revalidatePath(`/pools/${poolId}`);
}

export async function rotationAction(formData: FormData) {
  const user = await requireUser();
  const poolId = String(formData.get("poolId") ?? "");
  await driverOr403(poolId, user.id);
  await setRotation(poolId, formData.get("on") === "1");
  revalidatePath(`/pools/${poolId}`);
}
