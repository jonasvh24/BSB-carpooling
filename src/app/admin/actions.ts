"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { audit } from "@/lib/admin/audit";
import { recomputeOrg } from "@/lib/matching-service";
import { deleteUserCascade } from "@/lib/gdpr";
import { Thresholds } from "@/lib/admin/thresholds";
import { notify } from "@/lib/notify";
import { t, fmt } from "@/i18n";
import { DATE_RE, HM_RE } from "@/lib/time";
import { sendMail } from "@/lib/mail";
import { renderEmail } from "@/lib/notify";
import { env } from "@/lib/env";

// Every admin action is scoped to the admin's own organisation and audited (§8.2).

export async function recomputeAction() {
  const admin = await requireAdmin();
  const r = await recomputeOrg(admin.orgId);
  await audit(admin.id, "RECOMPUTE", "Organisation", admin.orgId, { matches: r.matches, ms: r.ms });
  revalidatePath("/admin");
  redirect(`/admin?recomputed=${r.ms}`);
}

const emailList = z.string().transform((s) =>
  Array.from(new Set(s.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))),
);

export async function inviteAction(formData: FormData) {
  const admin = await requireAdmin();
  const emails = emailList.parse(String(formData.get("emails") ?? ""));
  let n = 0;
  for (const email of emails) {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) continue;
    await db.invitation.upsert({ where: { email }, create: { email, orgId: admin.orgId, invitedBy: admin.id }, update: {} });
    const url = `${env.AUTH_URL.replace(/\/$/, "")}/signin`;
    const content = { title: fmt(t.email.inviteSubject, { org: admin.org.name, app: t.app.name }), body: fmt(t.email.inviteBody, { org: admin.org.name, app: t.app.name }) };
    await sendMail({ to: email, subject: content.title, ...renderEmail(content, url) }).catch(() => {});
    n++;
  }
  await audit(admin.id, "INVITE", "Organisation", admin.orgId, { count: n });
  revalidatePath("/admin/users");
  redirect(`/admin/users?invited=${n}`);
}

export async function suspendAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = formData.get("status") === "ACTIVE" ? "ACTIVE" : "SUSPENDED";
  const user = await db.user.findFirst({ where: { id, orgId: admin.orgId } });
  if (!user || user.id === admin.id) return;
  await db.user.update({ where: { id }, data: { status } });
  if (status === "SUSPENDED") await db.match.deleteMany({ where: { OR: [{ driverId: id }, { passengerId: id }], status: { not: "CONVERTED" } } });
  await audit(admin.id, status === "ACTIVE" ? "REINSTATE" : "SUSPEND", "User", id);
  revalidatePath("/admin/users");
}

export async function deleteUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const user = await db.user.findFirst({ where: { id, orgId: admin.orgId } });
  if (!user || user.id === admin.id) return;
  await deleteUserCascade(id);
  await audit(admin.id, "DELETE_USER", "User", id);
  revalidatePath("/admin/users");
}

export async function setRoleAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const role = formData.get("role") === "ADMIN" ? "ADMIN" : "MEMBER";
  const user = await db.user.findFirst({ where: { id, orgId: admin.orgId } });
  if (!user || user.id === admin.id) return;
  await db.user.update({ where: { id }, data: { role } });
  await audit(admin.id, "SET_ROLE", "User", id, { role });
  revalidatePath("/admin/users");
}

const siteSchema = z.object({
  id: z.string().optional().or(z.literal("")),
  name: z.string().trim().min(1).max(80),
  address: z.string().trim().max(200),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  defaultArriveBy: z.string().regex(HM_RE),
  defaultDepartEarliest: z.string().regex(HM_RE),
  parkingNote: z.string().trim().max(200).optional().or(z.literal("")),
  active: z.boolean(),
});

export async function saveSiteAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = siteSchema.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name"),
    address: formData.get("address") ?? "",
    lat: formData.get("lat"),
    lng: formData.get("lng"),
    defaultArriveBy: formData.get("defaultArriveBy"),
    defaultDepartEarliest: formData.get("defaultDepartEarliest"),
    parkingNote: formData.get("parkingNote") ?? "",
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return;
  const { id, ...data } = parsed.data;
  const row = { ...data, parkingNote: data.parkingNote || null };
  if (id) {
    const site = await db.site.findFirst({ where: { id, orgId: admin.orgId } });
    if (!site) return;
    await db.site.update({ where: { id }, data: row });
    await audit(admin.id, "UPDATE_SITE", "Site", id, row);
  } else {
    const site = await db.site.create({ data: { ...row, orgId: admin.orgId } });
    await audit(admin.id, "CREATE_SITE", "Site", site.id, row);
  }
  revalidatePath("/admin/sites");
}

export async function addHolidayAction(formData: FormData) {
  const admin = await requireAdmin();
  const from = z.string().regex(DATE_RE).safeParse(formData.get("from"));
  const to = z.string().regex(DATE_RE).safeParse(formData.get("to") || formData.get("from"));
  const label = String(formData.get("label") ?? "").trim().slice(0, 80) || "Holiday";
  if (!from.success || !to.success) return;
  const { addDaysIso } = await import("@/lib/time");
  let d = from.data;
  let n = 0;
  while (d <= to.data && n < 60) {
    await db.nonWorkingDay.upsert({ where: { orgId_date: { orgId: admin.orgId, date: d } }, create: { orgId: admin.orgId, date: d, label }, update: { label } });
    d = addDaysIso(d, 1);
    n++;
  }
  await audit(admin.id, "ADD_HOLIDAY", "Organisation", admin.orgId, { from: from.data, to: to.data, label });
  revalidatePath("/admin/holidays");
}

export async function removeHolidayAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await db.nonWorkingDay.deleteMany({ where: { id, orgId: admin.orgId } });
  await audit(admin.id, "REMOVE_HOLIDAY", "NonWorkingDay", id);
  revalidatePath("/admin/holidays");
}

const orgSchema = z.object({
  name: z.string().trim().min(1).max(120),
  allowedEmailDomains: z.string().transform((s) => s.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean).join(",")),
  timezone: z.string().trim().min(1),
  headcount: z.coerce.number().int().min(1),
  kmRateCents: z.coerce.number().int().min(0).max(500),
  co2GramsPerKm: z.coerce.number().int().min(0).max(1000),
  matchDetourThresholdMin: z.coerce.number().int().min(1).max(60),
  digestTime: z.string().regex(HM_RE),
  policyVersion: z.string().trim().min(1).max(20),
});

export async function saveOrgAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = orgSchema.safeParse(Object.fromEntries(["name", "allowedEmailDomains", "timezone", "headcount", "kmRateCents", "co2GramsPerKm", "matchDetourThresholdMin", "digestTime", "policyVersion"].map((k) => [k, formData.get(k)])));
  if (!parsed.success) return;
  const th = Thresholds.safeParse(Object.fromEntries(Object.keys(Thresholds.shape).map((k) => [k, Number(formData.get(`th_${k}`))])));
  await db.organisation.update({
    where: { id: admin.orgId },
    data: { ...parsed.data, ...(th.success ? { goNoGoThresholds: JSON.stringify(th.data) } : {}) },
  });
  await audit(admin.id, "UPDATE_ORG", "Organisation", admin.orgId, parsed.data);
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}

export async function resolveReportAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const report = await db.report.findFirst({ where: { id, reporter: { orgId: admin.orgId } } });
  if (!report) return;
  await db.report.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: admin.id } });
  await audit(admin.id, "RESOLVE_REPORT", "Report", id);
  revalidatePath("/admin/reports");
}

export async function sendSurveyAction(formData: FormData) {
  const admin = await requireAdmin();
  const key = formData.get("key") === "EXIT" ? "EXIT" : "WEEK4";
  const users = await db.user.findMany({ where: { orgId: admin.orgId, status: "ACTIVE", onboardingCompletedAt: { not: null } }, select: { id: true } });
  const name = key === "EXIT" ? t.survey.exitTitle : t.survey.week4Title;
  for (const u of users) {
    await notify(u.id, "SURVEY", { title: t.notifications.surveyTitle, body: fmt(t.notifications.surveyBody, { name }), link: `/survey/${key.toLowerCase()}` });
  }
  await audit(admin.id, "SEND_SURVEY", "Organisation", admin.orgId, { key, count: users.length });
  revalidatePath("/admin/surveys");
  redirect(`/admin/surveys?sent=${users.length}`);
}
