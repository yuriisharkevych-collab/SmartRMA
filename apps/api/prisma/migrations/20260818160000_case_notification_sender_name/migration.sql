-- Nazwa nadawcy e-mail per sprawa (np. "Veres Meble" zamiast nazwy firmy z Ustawienia
-- → E-mail) — czysto addytywne, obie kolumny nullable, zero zmiany zachowania dla
-- istniejących spraw/powiadomień.
ALTER TABLE "Case" ADD COLUMN     "notificationSenderName" TEXT;

ALTER TABLE "Notification" ADD COLUMN     "senderNameOverride" TEXT;
