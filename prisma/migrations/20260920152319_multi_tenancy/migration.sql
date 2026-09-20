-- Multi-tenancy. Hand-written so existing rows are backfilled into a default tenant.

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- Default tenant owns all pre-existing data.
INSERT INTO "Tenant" ("name", "slug") VALUES ('Default', 'default');

-- Add tenantId as nullable, backfill, then make it required.
ALTER TABLE "User" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "Vendor" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "PurchaseRequest" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "PurchaseOrder" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" INTEGER;

UPDATE "User" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');
UPDATE "Vendor" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');
UPDATE "PurchaseRequest" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');
UPDATE "PurchaseOrder" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');
UPDATE "AuditLog" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');

ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Vendor" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PurchaseRequest" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "tenantId" SET NOT NULL;

-- Uniqueness becomes per tenant.
DROP INDEX "User_email_key";
DROP INDEX "PurchaseOrder_poNumber_key";
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");
CREATE UNIQUE INDEX "PurchaseOrder_tenantId_poNumber_key" ON "PurchaseOrder"("tenantId", "poNumber");

-- Indexes for tenant-scoped list queries.
CREATE INDEX "Vendor_tenantId_status_idx" ON "Vendor"("tenantId", "status");
CREATE INDEX "PurchaseRequest_tenantId_status_createdAt_idx" ON "PurchaseRequest"("tenantId", "status", "createdAt");
CREATE INDEX "PurchaseOrder_tenantId_status_issuedAt_idx" ON "PurchaseOrder"("tenantId", "status", "issuedAt");

-- Foreign keys.
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
