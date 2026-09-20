-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "approvalThreshold" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approvalLimit" DECIMAL(12,2);
