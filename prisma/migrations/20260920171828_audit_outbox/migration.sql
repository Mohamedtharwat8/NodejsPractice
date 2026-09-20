-- Audit events move to MongoDB. The Postgres table becomes a transactional outbox: rows are written
-- with the change they describe and deleted once MongoDB has them. Existing rows stay and are
-- drained into MongoDB automatically, which backfills the history.
ALTER TABLE "AuditLog" RENAME TO "AuditOutbox";
ALTER TABLE "AuditOutbox" RENAME CONSTRAINT "AuditLog_pkey" TO "AuditOutbox_pkey";
ALTER TABLE "AuditOutbox" RENAME CONSTRAINT "AuditLog_tenantId_fkey" TO "AuditOutbox_tenantId_fkey";
ALTER TABLE "AuditOutbox" RENAME CONSTRAINT "AuditLog_actorId_fkey" TO "AuditOutbox_actorId_fkey";
ALTER SEQUENCE "AuditLog_id_seq" RENAME TO "AuditOutbox_id_seq";

ALTER TABLE "AuditOutbox"
  ADD COLUMN "before" JSONB,
  ADD COLUMN "after" JSONB,
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastError" TEXT;

CREATE INDEX "AuditOutbox_tenantId_id_idx" ON "AuditOutbox"("tenantId", "id");
