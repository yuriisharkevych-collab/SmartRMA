-- CreateIndex
CREATE INDEX "Case_companyId_createdAt_idx" ON "Case"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Case_companyId_ownerId_idx" ON "Case"("companyId", "ownerId");

-- CreateIndex
CREATE INDEX "Case_companyId_shopId_idx" ON "Case"("companyId", "shopId");

-- CreateIndex
CREATE INDEX "CaseItem_manufacturerId_idx" ON "CaseItem"("manufacturerId");
