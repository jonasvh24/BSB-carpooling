"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { DATE_RE, HM_RE } from "@/lib/time";
import { applyExceptionToTrips } from "@/lib/pools/trips";

const schema = z.object({
  date: z.string().regex(DATE_RE),
  kind: z.enum(["OFF", "CHANGED"]),
  arriveBy: z.string().regex(HM_RE).optional().or(z.literal("")),
  departEarliest: z.string().regex(HM_RE).optional().or(z.literal("")),
  note: z.string().trim().max(120).optional().or(z.literal("")),
});

export async function addException(formData: FormData) {
  const user = await requireUser();
  const parsed = schema.safeParse({
    date: formData.get("date"),
    kind: formData.get("kind"),
    arriveBy: formData.get("arriveBy") ?? "",
    departEarliest: formData.get("departEarliest") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return;
  const d = parsed.data;
  await db.scheduleException.upsert({
    where: { userId_date: { userId: user.id, date: d.date } },
    create: { userId: user.id, date: d.date, kind: d.kind, arriveBy: d.arriveBy || null, departEarliest: d.departEarliest || null, note: d.note || null },
    update: { kind: d.kind, arriveBy: d.arriveBy || null, departEarliest: d.departEarliest || null, note: d.note || null },
  });
  // Trips already materialised for that date must reflect the change immediately.
  await applyExceptionToTrips(user.id, d.date);
  revalidatePath("/schedule");
  revalidatePath("/pools");
}

export async function removeException(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const row = await db.scheduleException.findFirst({ where: { id, userId: user.id } });
  if (!row) return;
  await db.scheduleException.delete({ where: { id } });
  await applyExceptionToTrips(user.id, row.date);
  revalidatePath("/schedule");
}
