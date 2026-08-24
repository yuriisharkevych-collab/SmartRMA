-- CaseConsent: zgoda na udostępnienie dokumentów/zdjęć producentowi lub dystrybutorowi.
-- Opcjonalna, domyślnie false — wiersze sprzed tej kolumny (już złożone zgody) nie
-- oznaczają milcząco zgody, której klient nigdy nie wyraził.
ALTER TABLE "CaseConsent" ADD COLUMN     "documentSharingConsent" BOOLEAN NOT NULL DEFAULT false;
