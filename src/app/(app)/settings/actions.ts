"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { deleteUserCascade, withdrawResearch } from "@/lib/gdpr";
import { withdrawLocation } from "@/lib/consent";
import { audit } from "@/lib/admin/audit";
import { recomputeUser } from "@/lib/matching-service";
import { rateLimit } from "@/lib/rate-limit";

export async function setMuteAction(formData: FormData) {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { muteEmail: formData.get("muteEmail") === "on" } });
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

export async function withdrawLocationAction() {
  const user = await requireUser();
  await withdrawLocation(user.id);
  revalidatePath("/settings/privacy");
}

export async function withdrawResearchAction() {
  const user = await requireUser();
  await withdrawResearch(user.id);
  revalidatePath("/settings/privacy");
}

export async function giveResearchAction() {
  const user = await requireUser();
  const open = await db.consent.findFirst({ where: { userId: user.id, scope: "PILOT_RESEARCH", withdrawnAt: null } });
  if (!open) await db.consent.create({ data: { userId: user.id, scope: "PILOT_RESEARCH", policyVersion: user.org.policyVersion } });
  revalidatePath("/settings/privacy");
}

export async function deleteAccountAction(formData: FormData) {
  const user = await requireUser();
  if (String(formData.get("confirm") ?? "") !== "DELETE") redirect("/settings/privacy?error=confirm");
  // Counted, not attributed: no user id is written.
  await audit(user.orgId, null, "SELF_DELETE", "User", "self");
  await deleteUserCascade(user.id);
  await signOut({ redirectTo: "/?deleted=1" });
}

const reportSchema = z.object({
  reportedUserId: z.string().min(1),
  poolId: z.string().optional().or(z.literal("")),
  reason: z.enum(["NO_SHOW", "LATE", "UNSAFE", "BEHAVIOUR", "OTHER"]),
  details: z.string().trim().max(1000).optional().or(z.literal("")),
  block: z.boolean(),
});

export async function reportAction(formData: FormData) {
  const user = await requireUser();
  if (!rateLimit(`report:${user.id}`, 10, 24 * 60 * 60 * 1000)) return;
  const parsed = reportSchema.safeParse({
    reportedUserId: formData.get("reportedUserId"),
    poolId: formData.get("poolId") ?? "",
    reason: formData.get("reason"),
    details: formData.get("details") ?? "",
    block: formData.get("block") === "on",
  });
  if (!parsed.success) return;
  const d = parsed.data;
  const target = await db.user.findFirst({ where: { id: d.reportedUserId, orgId: user.orgId } });
  if (!target || target.id === user.id) return;
  const pool = d.poolId ? await db.poolMember.findFirst({ where: { poolId: d.poolId, userId: user.id }, select: { poolId: true } }) : null;
  await db.report.create({ data: { reporterId: user.id, reportedUserId: target.id, poolId: pool?.poolId ?? null, reason: d.reason, details: d.details || null } });
  if (d.block) await blockUser(user.id, target.id);
  redirect("/settings/report?sent=1");
}

async function blockUser(blockerId: string, blockedId: string) {
  await db.block.upsert({ where: { blockerId_blockedId: { blockerId, blockedId } }, create: { blockerId, blockedId }, update: {} });
  // Blocked pairs never match (§9.8): drop cached pairs and any pending requests.
  await db.match.deleteMany({ where: { OR: [{ driverId: blockerId, passengerId: blockedId }, { driverId: blockedId, passengerId: blockerId }], status: { not: "CONVERTED" } } });
  await db.poolRequest.updateMany({ where: { status: "PENDING", OR: [{ fromUserId: blockerId, toUserId: blockedId }, { fromUserId: blockedId, toUserId: blockerId }] }, data: { status: "WITHDRAWN", respondedAt: new Date() } });
}

export async function blockAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("userId") ?? "");
  const target = await db.user.findFirst({ where: { id, orgId: user.orgId } });
  if (!target || target.id === user.id) return;
  await blockUser(user.id, target.id);
  revalidatePath("/settings/report");
}

export async function unblockAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("userId") ?? "");
  await db.block.deleteMany({ where: { blockerId: user.id, blockedId: id } });
  await recomputeUser(user.id);
  revalidatePath("/settings/report");
}
