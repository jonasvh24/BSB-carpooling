import { db } from "../db";

// Admin actions only. `details` must never hold a name or an email address:
// the row outlives the account it is about (docs/legal/DATA_MAP.md).
export async function audit(orgId: string, actorId: string | null, action: string, targetType: string, targetId: string, details?: unknown) {
  await db.auditLog.create({ data: { orgId, actorId, action, targetType, targetId, details: details == null ? null : JSON.stringify(details) } });
}
