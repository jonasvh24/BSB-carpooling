"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

const schema = z.object({
  recommend: z.coerce.number().int().min(1).max(5),
  worked: z.string().trim().max(1000).optional().or(z.literal("")),
  didnt: z.string().trim().max(1000).optional().or(z.literal("")),
  oneChange: z.string().trim().max(1000).optional().or(z.literal("")),
  keep: z.enum(["YES", "MAYBE", "NO"]).optional().or(z.literal("")),
  pay: z.enum(["YES", "MAYBE", "NO"]).optional().or(z.literal("")),
});

export async function submitSurvey(formData: FormData) {
  const user = await requireUser();
  const key = formData.get("key") === "EXIT" ? "EXIT" : "WEEK4";
  const parsed = schema.safeParse(Object.fromEntries(["recommend", "worked", "didnt", "oneChange", "keep", "pay"].map((k) => [k, formData.get(k) ?? ""])));
  if (!parsed.success) return;
  const trips = await db.tripParticipant.count({ where: { userId: user.id, status: "IN", trip: { status: "DONE" } } });
  await db.surveyResponse.create({ data: { userId: user.id, surveyKey: key, answers: JSON.stringify({ ...parsed.data, tripsSoFar: trips }) } });
  redirect(`/survey/${key.toLowerCase()}?done=1`);
}
