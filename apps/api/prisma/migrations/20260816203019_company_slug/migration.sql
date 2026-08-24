-- AlterTable
ALTER TABLE "Company" ADD COLUMN "slug" TEXT;

-- Backfill: Publiczny Formularz Reklamacyjny rozstrzyga organizację po `slug`
-- w adresie (/reklamacja/:orgSlug), zastępując dawne "jedyna aktywna firma"
-- (BR-086). Każda istniejąca firma musi dostać slug, żeby jej dotychczasowy
-- link do formularza dalej działał (patrz redirect w routerze frontendu).
UPDATE "Company"
SET "slug" = lower(regexp_replace(regexp_replace(trim(both ' ' from "name"), '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'))
WHERE "slug" IS NULL;

-- Rozstrzygnięcie kolizji (dwie firmy o tej samej wygenerowanej nazwie) —
-- dopisanie fragmentu id do wszystkich oprócz pierwszego wiersza w grupie.
UPDATE "Company" c
SET "slug" = c."slug" || '-' || substr(c."id", 1, 8)
WHERE c."id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (PARTITION BY "slug" ORDER BY "createdAt") AS rn
    FROM "Company"
  ) ranked
  WHERE rn > 1
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");
