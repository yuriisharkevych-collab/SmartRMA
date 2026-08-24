import { Injectable } from '@nestjs/common';
import { CaseItem, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaClientLike = Prisma.TransactionClient | PrismaService;

/**
 * Wydzielone z `CasesRepository` (Zadanie 16, zakres zadania wymaga osobnego
 * repozytorium). Tworzenie pozycji nadal odbywa się zagnieżdżone w
 * `CasesRepository.create()` (`items: { create: [...] }`, jedna transakcja
 * Prisma) — to repozytorium obsługuje odczyt i jedyną udokumentowaną mutację
 * pozycji NIEZALEŻNĄ od tworzenia sprawy (BR-072 — zmiana sugerowanego
 * producenta pozycji), pominiętą w zakresie service/controller tego zadania
 * (nie ma dla niej endpointu w liście z Zadania 16), ale przygotowaną tu,
 * żeby repozytorium było kompletne.
 */
@Injectable()
export class CaseItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByCaseId(caseId: string): Promise<CaseItem[]> {
    return this.prisma.caseItem.findMany({ where: { caseId } });
  }

  findById(id: string): Promise<CaseItem | null> {
    return this.prisma.caseItem.findUnique({ where: { id } });
  }

  /** `companyId` sprawdzony PRZEZ relację do `Case` — bez tego produkt zastępczy dałoby się wystawić/przyjąć dla pozycji sprawy innej firmy, znając samo UUID (IDOR, patrz audyt bezpieczeństwa). */
  findByIdForCompany(id: string, companyId: string): Promise<CaseItem | null> {
    return this.prisma.caseItem.findFirst({ where: { id, case: { companyId } } });
  }

  /** Portal Klienta — token portalu niesie `caseId`, nie `companyId` (RBAC.md §1.2), więc zakres sprawdzany PRZEZ relację do `Case` po `caseId` zamiast po firmie. */
  findByIdForCase(id: string, caseId: string): Promise<CaseItem | null> {
    return this.prisma.caseItem.findFirst({ where: { id, caseId } });
  }

  updateManufacturer(id: string, manufacturerId: string | null): Promise<CaseItem> {
    return this.prisma.caseItem.update({ where: { id }, data: { manufacturerId } });
  }

  /** `cases.edit` — poprawa danych pozycji przez pracownika (BR-072/BR-074), patrz `CasesService.updateItem`. */
  updateFields(
    id: string,
    data: Partial<
      Pick<
        CaseItem,
        | 'productId'
        | 'manufacturerId'
        | 'description'
        | 'serialNumber'
        | 'frameNumber'
        | 'purchaseDate'
        | 'purchaseProofNumber'
      >
    >,
    client: PrismaClientLike = this.prisma,
  ): Promise<CaseItem> {
    return client.caseItem.update({ where: { id }, data });
  }

  /** Portal Klienta — uzupełnienie danych egzemplarza przez klienta (numer seryjny/ramy/dowodu zakupu), wyłącznie pola faktycznie przesłane. */
  updatePortalFields(
    id: string,
    data: Partial<Pick<CaseItem, 'serialNumber' | 'frameNumber' | 'purchaseProofNumber'>>,
  ): Promise<CaseItem> {
    return this.prisma.caseItem.update({ where: { id }, data });
  }

  /** `cases.delete` (RBAC.md §5, jedyny hard-delete w aplikacji) — `ReplacementProduct` referencjonuje `CaseItem`, nie `Case`, więc musi zniknąć PRZED `CaseItem` (kolejność FK). `client` — wywołujący (`CasesService.hardDelete`) przekazuje `tx`, żeby kasowanie było atomowe z resztą kaskady. */
  async deleteAllForCase(caseId: string, client: PrismaClientLike = this.prisma): Promise<void> {
    await client.replacementProduct.deleteMany({ where: { caseItem: { caseId } } });
    await client.caseItem.deleteMany({ where: { caseId } });
  }
}
