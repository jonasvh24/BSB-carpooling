-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "orgId" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");
