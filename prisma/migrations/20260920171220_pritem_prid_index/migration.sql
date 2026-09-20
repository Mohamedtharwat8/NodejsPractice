-- Loading a request's items filters PRItem by prId; Postgres does not index foreign keys automatically.
CREATE INDEX "PRItem_prId_idx" ON "PRItem"("prId");
