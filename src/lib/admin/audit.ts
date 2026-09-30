import { db } from "../db";

export async function audit(actorId: string | null, action: string, targetType: string, targetId: string, details?: unknown) {
  await db.auditLog.create({ data: { actorId, action, targetType, targetId, details: details == null ? null : JSON.stringify(details) } });
}
