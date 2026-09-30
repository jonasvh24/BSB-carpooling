"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { acceptRequest, declineRequest, withdrawRequest } from "@/lib/pools/service";

export async function acceptAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const r = await acceptRequest(id, user.id);
  revalidatePath("/requests");
  revalidatePath("/pools");
  if (r.ok) redirect(`/pools/${r.poolId}?joined=1`);
  redirect(`/requests?error=${encodeURIComponent(r.reason)}`);
}

export async function declineAction(formData: FormData) {
  const user = await requireUser();
  await declineRequest(String(formData.get("id") ?? ""), user.id, String(formData.get("reason") ?? "") || undefined);
  revalidatePath("/requests");
}

export async function withdrawAction(formData: FormData) {
  const user = await requireUser();
  await withdrawRequest(String(formData.get("id") ?? ""), user.id);
  revalidatePath("/requests");
  revalidatePath("/matches");
}
