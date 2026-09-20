-- List endpoints order by id (newest first) and page by cursor, so indexes must end in id.
-- The old (tenantId, status, createdAt) / (tenantId, status, issuedAt) indexes served no query.
DROP INDEX "PurchaseRequest_tenantId_status_createdAt_idx";
DROP INDEX "PurchaseOrder_tenantId_status_issuedAt_idx";

CREATE INDEX "PurchaseRequest_tenantId_id_idx" ON "PurchaseRequest"("tenantId", "id");
CREATE INDEX "PurchaseRequest_tenantId_status_id_idx" ON "PurchaseRequest"("tenantId", "status", "id");
CREATE INDEX "PurchaseRequest_tenantId_requesterId_id_idx" ON "PurchaseRequest"("tenantId", "requesterId", "id");
CREATE INDEX "PurchaseOrder_tenantId_id_idx" ON "PurchaseOrder"("tenantId", "id");
CREATE INDEX "PurchaseOrder_tenantId_status_id_idx" ON "PurchaseOrder"("tenantId", "status", "id");
