"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { confirmTrip, driverCancel, optOutTrip, verifyTrip } from "@/lib/pools/daily";
import { acceptLift } from "@/lib/pools/lifts";
import { DATE_RE } from "@/lib/time";

function refresh(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/pools");
}

export async function confirmAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  await confirmTrip(id, user.id);
  refresh(id);
}

export async function optOutAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  await optOutTrip(id, user.id);
  refresh(id);
}

export async function cancelAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  await driverCancel(id, user.id);
  refresh(id);
}

export async function verifyAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const outcome = z.enum(["DONE", "NOT_HAPPENED", "NO_SHOW"]).safeParse(formData.get("outcome"));
  if (!outcome.success) return;
  const noShow = formData.getAll("noShow").map(String);
  await verifyTrip(id, user.id, outcome.data, noShow);
  refresh(id);
}

export async function thumbsUpAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const trip = await db.trip.findFirst({ where: { id, participants: { some: { userId: user.id } } } });
  if (!trip) return;
  await db.auditLog.create({ data: { actorId: user.id, action: "TRIP_THUMBS_UP", targetType: "Trip", targetId: id } });
  refresh(id);
}

const liftSchema = z.object({ driverId: z.string().min(1), date: z.string().regex(DATE_RE), direction: z.enum(["AM", "PM"]), siteId: z.string().min(1) });

export async function acceptLiftAction(formData: FormData) {
  const user = await requireUser();
  const parsed = liftSchema.safeParse({
    driverId: formData.get("driverId"),
    date: formData.get("date"),
    direction: formData.get("direction"),
    siteId: formData.get("siteId"),
  });
  if (!parsed.success) return;
  const d = parsed.data;
  const tripId = await acceptLift(user.id, d.driverId, d.date, d.direction, d.siteId);
  revalidatePath("/pools");
  if (tripId) redirect(`/trips/${tripId}`);
}
