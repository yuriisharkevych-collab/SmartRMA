-- Formularz rozgałęziony marki, wariant "osobne konto Dystrybutora" (Veres Meble) —
-- partner B2B wybrany w kroku "Wybór partnera" to teraz realna Company powiązana
-- AKTYWNYM Partnership, nie Contractor tej samej firmy. Czysto addytywne.
ALTER TABLE "Case" ADD COLUMN     "reportedByPartnerCompanyId" TEXT;

ALTER TABLE "Case" ADD CONSTRAINT "Case_reportedByPartnerCompanyId_fkey" FOREIGN KEY ("reportedByPartnerCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
