-- Zadanie: "Producent/Dystrybutor i Marka opcjonalne" + "Pracownicy bez e-maila"
-- Wyłącznie zmiany addytywne/relaksujące ograniczenia — brak utraty danych,
-- istniejące wiersze Product/User zostają nietknięte.

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_manufacturerId_fkey";

-- AlterTable
-- Product.manufacturerId nullable — pracownik może zarejestrować reklamację
-- na model, którego producenta/dystrybutora jeszcze nie ma w katalogu.
ALTER TABLE "Product" ALTER COLUMN "manufacturerId" DROP NOT NULL;

-- AlterTable
-- User.email nullable + nowa kolumna User.login — pracownicy bez własnej
-- skrzynki firmowej logują się loginem zamiast e-mailem (patrz
-- AuthService.validateCredentials).
ALTER TABLE "User" ADD COLUMN     "login" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "User_login_idx" ON "User"("login");

-- AddForeignKey
-- ON DELETE SET NULL (zamiast poprzedniego ograniczenia) — usunięcie
-- producenta z katalogu odpina produkt, nie blokuje/kasuje go.
ALTER TABLE "Product" ADD CONSTRAINT "Product_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Login unikalny W OBRĘBIE FIRMY (nie globalnie, w odróżnieniu od e-maila) —
-- ten sam wzorzec "prawdziwa unikalność poza atrybutem Prisma" co
-- `User_email_password_key` w migracji `pin_login` (Postgres nie ma
-- `NULLS NOT DISTINCT` w tej wersji, więc częściowy indeks ręcznie w SQL,
-- nie `@@unique` w schema.prisma).
CREATE UNIQUE INDEX "User_companyId_login_key" ON "User"("companyId", "login") WHERE "login" IS NOT NULL;
