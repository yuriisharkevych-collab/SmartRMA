-- Etap 3 (Marki i konfiguracja procesu reklamacyjnego) — opcjonalne nadpisania
-- wymagań/SLA na poziomie marki (NULL = dziedzicz z Manufacturer, rozstrzygane
-- wyłącznie przez requirements-resolver.ts) + konfigurowalne kategorie
-- produktowe formularza publicznego per producent (zastępuje hardcoded
-- BRAND_PRODUCT_CATEGORIES). Czysto addytywne, wszystkie nowe kolumny nullable
-- lub z bezpiecznym default([]).
ALTER TABLE "Brand" ADD COLUMN     "caseAgeStaleDaysOverride" INTEGER,
ADD COLUMN     "maxAttachmentSizeMb" INTEGER,
ADD COLUMN     "maxPhotos" INTEGER,
ADD COLUMN     "minPhotos" INTEGER,
ADD COLUMN     "requiresFrameNumber" BOOLEAN,
ADD COLUMN     "requiresProofOfPurchase" BOOLEAN,
ADD COLUMN     "requiresSerialNumber" BOOLEAN,
ADD COLUMN     "requiresVideo" BOOLEAN,
ADD COLUMN     "statusStaleDaysOverride" INTEGER;

ALTER TABLE "Manufacturer" ADD COLUMN     "productCategories" TEXT[] DEFAULT ARRAY[]::TEXT[];
