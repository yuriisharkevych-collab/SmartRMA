import { Injectable } from '@nestjs/common';
import { Case, CasePriority, CaseStatus, ComplaintSource, ComplaintType, Decision, Prisma, SubmissionMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CaseWithItems } from './mappers/case.mapper';

const WITH_ITEMS = { items: true } as const;

type PrismaClientLike = Prisma.TransactionClient | PrismaService;

/**
 * Czyste operacje na danych — bez zapisu `CaseHistory`/`AuditLog`, bez
 * publikacji zdarzeń, bez walidacji `STATE_MACHINE.md`. To wszystko żyje w
 * `CasesService` (EVENTS.md §1.2: niezmienniki w tej samej transakcji co
 * mutacja stanu). `CaseHistory`/`Note`/`Message` wydzielone do własnych
 * repozytoriów (Zadanie 16) — ten plik zna wyłącznie `Case`.
 *
 * `update()`/`create()` zawężone do jawnych typów (nie `Prisma.CaseUpdateInput`/
 * `UncheckedCreateInput` wprost) — ten sam błąd, co naprawiony w Zadaniu 14
 * dla `ProductsRepository`, tutaj naprawiony od razu.
 *
 * Metody mutujące przyjmują opcjonalny `client` (domyślnie `this.prisma`) —
 * `CasesService` przekazuje `tx` z `prisma.$transaction(async (tx) => ...)`,
 * żeby mutacja `Case` + wpis `CaseHistory` + `AuditLog` były atomowe (patrz
 * uzasadnienie w `AuditRepository.create`). `findByIdForUpdate` WYMAGA
 * realnego `tx` (nie ma sensownej wartości domyślnej — blokada wiersza poza
 * transakcją zwalnia się natychmiast).
 */
@Injectable()
export class CasesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllForCompany(companyId: string): Promise<CaseWithItems[]> {
    return this.prisma.case.findMany({ where: { companyId }, include: WITH_ITEMS, orderBy: { createdAt: 'desc' } });
  }

  /** Wyszukiwanie po numerze sprawy (dopasowanie częściowe) — wzorzec z `OrdersRepository.search`. */
  search(companyId: string, query: string): Promise<CaseWithItems[]> {
    return this.prisma.case.findMany({
      where: { companyId, caseNumber: { contains: query, mode: 'insensitive' } },
      include: WITH_ITEMS,
      take: 50,
    });
  }

  findById(id: string): Promise<CaseWithItems | null> {
    return this.prisma.case.findUnique({ where: { id }, include: WITH_ITEMS });
  }

  /**
   * Blokuje wiersz `Case` (`SELECT ... FOR UPDATE`) na czas transakcji, potem
   * odczytuje pełny rekord — wymuszony punkt wejścia dla wszystkich mutacji
   * zależnych od bieżącego stanu (`performTransition`/`setDecision`), żeby
   * dwie równoczesne zmiany tej samej sprawy serializowały się na poziomie
   * bazy, zamiast obie czytać ten sam "stary" stan i obie uznać swoje
   * przejście za legalne (utracona aktualizacja). Brak `@@map` w schemacie →
   * nazwa tabeli Postgres to dosłownie `"Case"` (PascalCase, wymaga
   * cudzysłowu). Wymaga PRAWDZIWEGO `tx` — `SELECT FOR UPDATE` poza
   * transakcją zwalnia blokadę natychmiast po wykonaniu, więc nie miałby
   * żadnego efektu.
   */
  async findByIdForUpdate(id: string, tx: Prisma.TransactionClient): Promise<CaseWithItems | null> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Case" WHERE id = ${id} FOR UPDATE`;
    if (locked.length === 0) return null;
    return tx.case.findUnique({ where: { id }, include: WITH_ITEMS });
  }

  /**
   * USER-003 (ERROR_CODES.md) — wołane z `UsersModule` (Zadanie 2) przy
   * dezaktywacji pracownika, żeby ostrzec, że jest właścicielem otwartych
   * spraw. "Status aktywny" = każdy poza `Zamknieta`/`Anulowana`/
   * `Zarchiwizowana`, dokładnie jak WORKFLOW.md §2.3.
   */
  countActiveByOwner(ownerId: string): Promise<number> {
    return this.prisma.case.count({
      where: {
        ownerId,
        status: { notIn: [CaseStatus.Zamknieta, CaseStatus.Anulowana, CaseStatus.Zarchiwizowana] },
      },
    });
  }

  findByCaseNumber(caseNumber: string): Promise<CaseWithItems | null> {
    return this.prisma.case.findUnique({ where: { caseNumber }, include: WITH_ITEMS });
  }

  /**
   * CASE-013 — baza sekwencji numeru `RMA/{rok}/{sekwencja}`, per firma i
   * rok (`CasesService` dolicza retry na kolizję). UWAGA: `Case.caseNumber`
   * jest unikalny GLOBALNIE w schemacie (`@unique`, nie złożony z
   * `companyId`) — licznik per-firma jest poprawny wyłącznie dopóki BR-086
   * pozostaje w mocy (dokładnie jedna `Company`); przy realnym
   * wielonajemcowym wdrożeniu ten licznik musiałby być globalny, żeby
   * uniknąć gwarantowanej kolizji numerów między firmami.
   */
  countCreatedInYear(companyId: string, year: number): Promise<number> {
    return this.prisma.case.count({
      where: { companyId, createdAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    });
  }

  create(
    companyId: string,
    caseNumber: string,
    data: {
      shopId?: string | null;
      customerId: string;
      ownerId?: string | null;
      complaintType: ComplaintType;
      submissionMode: SubmissionMode;
      source?: ComplaintSource;
      requestedResolution: string | null;
      description: string | null;
      customerStatement?: string | null;
      deliveryAddress?: string | null;
      courierRequested?: boolean;
      preparationFeeAccepted?: boolean;
      clientPortalEnabled?: boolean;
      nextAction?: string | null;
      items: Array<{ orderItemId?: string; productId: string; manufacturerId?: string; description: string }>;
    },
    client: PrismaClientLike = this.prisma,
  ): Promise<CaseWithItems> {
    const { items, ...rest } = data;
    return client.case.create({
      data: { ...rest, companyId, caseNumber, items: { create: items } },
      include: WITH_ITEMS,
    });
  }

  update(
    id: string,
    data: Partial<Pick<Case, 'requestedResolution' | 'description' | 'priority'>>,
    client: PrismaClientLike = this.prisma,
  ): Promise<CaseWithItems> {
    return client.case.update({ where: { id }, data, include: WITH_ITEMS });
  }

  /**
   * Bramka generyczna dla WSZYSTKICH przejść statusu (zwykłych, anulowania,
   * archiwizacji) — `CasesService` decyduje o znaczniku czasu właściwym dla
   * `to` (`closedAt`/`cancelledAt`/`archivedAt`) i o `nextAction` (WORKFLOW.md
   * §7), to repozytorium tylko zapisuje to, co dostanie (konsolidacja
   * poprzednich osobnych metod `updateStatus`/`cancel`/`archive`/
   * `requestInfo` — duplikowały ten sam `prisma.case.update`).
   */
  updateStatus(
    id: string,
    status: CaseStatus,
    extra: Partial<Pick<Case, 'closedAt' | 'cancelledAt' | 'archivedAt' | 'nextAction'>> = {},
    client: PrismaClientLike = this.prisma,
  ): Promise<CaseWithItems> {
    return client.case.update({ where: { id }, data: { status, ...extra }, include: WITH_ITEMS });
  }

  setDecision(
    id: string,
    decision: Decision,
    decisionByUserId: string,
    requiresManagerApproval: boolean,
    client: PrismaClientLike = this.prisma,
  ): Promise<CaseWithItems> {
    return client.case.update({
      where: { id },
      data: { decision, decisionByUserId, decisionAt: new Date(), requiresManagerApproval },
      include: WITH_ITEMS,
    });
  }

  setPriority(id: string, priority: CasePriority): Promise<CaseWithItems> {
    return this.prisma.case.update({ where: { id }, data: { priority }, include: WITH_ITEMS });
  }

  assignOwner(id: string, ownerId: string, client: PrismaClientLike = this.prisma): Promise<CaseWithItems> {
    return client.case.update({ where: { id }, data: { ownerId }, include: WITH_ITEMS });
  }

  /** WORKFLOW.md §6 poz. 13 — kod jawny generuje i zwraca (tylko raz) `CasesService`, tu zapisujemy wyłącznie hash. */
  enablePortalWithAccessCode(id: string, accessCodeHash: string): Promise<CaseWithItems> {
    return this.prisma.case.update({
      where: { id },
      data: { clientPortalEnabled: true, clientAccessCodeHash: accessCodeHash },
      include: WITH_ITEMS,
    });
  }

  /** WORKFLOW.md §6 poz. 21 — unieważnia oba mechanizmy dostępu (kod i bezpieczny link) naraz. */
  disablePortal(id: string): Promise<CaseWithItems> {
    return this.prisma.case.update({
      where: { id },
      data: { clientPortalEnabled: false, clientAccessCodeHash: null, clientAccessTokenHash: null },
      include: WITH_ITEMS,
    });
  }

  /** WORKFLOW.md §6 poz. 14 — token jawny generuje i zwraca (tylko raz) `CasesService`, tu zapisujemy wyłącznie hash. */
  generateSecureToken(id: string, tokenHash: string): Promise<CaseWithItems> {
    return this.prisma.case.update({
      where: { id },
      data: { clientAccessTokenHash: tokenHash, clientAccessTokenUsed: false },
      include: WITH_ITEMS,
    });
  }

  /** BR-077 — token jednorazowy; woła to `PortalService` po udanym logowaniu linkiem. */
  markPortalTokenUsed(id: string): Promise<CaseWithItems> {
    return this.prisma.case.update({
      where: { id },
      data: { clientAccessTokenUsed: true, clientLastLoginAt: new Date() },
      include: WITH_ITEMS,
    });
  }

  /** Wołane po każdym udanym logowaniu Portalu (kodem lub linkiem) — BUSINESS_RULES.md BR-077. */
  touchPortalLastLogin(id: string): Promise<CaseWithItems> {
    return this.prisma.case.update({ where: { id }, data: { clientLastLoginAt: new Date() }, include: WITH_ITEMS });
  }

  // --- ReplacementProduct / Logistics — POZA zakresem Zadania 16 (patrz raport końcowy), zostawione bez zmian ---

  issueReplacement(caseItemId: string, productIdentifier: string, plannedReturnAt?: Date) {
    return this.prisma.replacementProduct.create({
      data: { caseItemId, productIdentifier, issuedAt: new Date(), plannedReturnAt },
    });
  }

  returnReplacement(caseItemId: string, conditionOnReturn?: string) {
    return this.prisma.replacementProduct.update({
      where: { caseItemId },
      data: { returnedAt: new Date(), conditionOnReturn },
    });
  }

  findLogistics(caseId: string) {
    return this.prisma.logistics.findMany({ where: { caseId } });
  }
}
