-- Message <-> Document: 1:1 (Message.documentId) -> 1:N (Document.messageId).
-- Wiadomość dostaje wiele załączników zamiast jednego; jeden Document nadal
-- należy do co najwyżej jednej Message.

-- AlterTable: nowa kolumna na Document (nullable, jeszcze bez ograniczeń)
ALTER TABLE "Document" ADD COLUMN "messageId" TEXT;

-- Migracja danych: PRZED skasowaniem starej kolumny przenieś istniejące
-- powiązania Message.documentId -> Document.messageId, żeby nie stracić
-- już istniejących załączników do wiadomości.
UPDATE "Document" d
SET "messageId" = m."id"
FROM "Message" m
WHERE m."documentId" = d."id";

-- DropForeignKey (stara relacja Message -> Document)
ALTER TABLE "Message" DROP CONSTRAINT "Message_documentId_fkey";

-- DropIndex (stary unikalny indeks wymuszający 1:1)
DROP INDEX "Message_documentId_key";

-- AlterTable: usunięcie starej kolumny z Message
ALTER TABLE "Message" DROP COLUMN "documentId";

-- CreateIndex
CREATE INDEX "Document_messageId_idx" ON "Document"("messageId");

-- AddForeignKey (nowa relacja Document -> Message)
ALTER TABLE "Document" ADD CONSTRAINT "Document_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
