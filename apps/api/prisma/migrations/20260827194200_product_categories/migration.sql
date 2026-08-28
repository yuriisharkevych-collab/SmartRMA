-- Etap 4 (Produkty i konfiguracja formularza) — kategoria produktowa jako
-- pełnoprawna encja per producent, zastępująca płaską tablicę
-- `Manufacturer.productCategories` (Etap 3). Kolejność ma znaczenie:
-- 1) utworzyć nową tabelę, 2) dodać `Product.categoryId`, 3) PRZENIEŚĆ dane
-- ze starej tablicy do nowych wierszy (żeby Veres Meble/TekstylPol zachowały
-- swoje listy), 4) dopiero potem usunąć starą kolumnę — nigdy odwrotnie.

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCategory_companyId_idx" ON "ProductCategory"("companyId");

-- CreateIndex
CREATE INDEX "ProductCategory_manufacturerId_idx" ON "ProductCategory"("manufacturerId");

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration: każdy string z `Manufacturer.productCategories` -> wiersz `ProductCategory`
-- tego samego producenta/firmy, kolejność zachowana (WITH ORDINALITY), żadna
-- kategoria żadnej firmy nie ginie.
INSERT INTO "ProductCategory" ("id", "companyId", "manufacturerId", "name", "active", "createdAt")
SELECT gen_random_uuid(), m."companyId", m."id", cat.name, true, CURRENT_TIMESTAMP
FROM "Manufacturer" m,
     LATERAL unnest(m."productCategories") WITH ORDINALITY AS cat(name, ord);

-- DataMigration: dla istniejących `Product` wierszy z wolnotekstowym `category`,
-- podłącz `categoryId` do nowo utworzonej kategorii TEGO SAMEGO producenta o
-- identycznej nazwie (best-effort, nigdy nie modyfikuje/usuwa `Product.category`).
UPDATE "Product" p
SET "categoryId" = pc."id"
FROM "ProductCategory" pc
WHERE pc."manufacturerId" = p."manufacturerId"
  AND pc."name" = p."category"
  AND p."categoryId" IS NULL;

-- AlterTable — stara płaska tablica zastąpiona relacją powyżej, jedno źródło prawdy.
ALTER TABLE "Manufacturer" DROP COLUMN "productCategories";
