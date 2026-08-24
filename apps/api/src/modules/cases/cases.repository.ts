import { Injectable } from '@nestjs/common';
import {
  Case,
  CaseContactPreference,
  CaseOriginType,
  CasePriority,
  ComplaintSource,
  ComplaintType,
  Decision,
  DecisionFulfillmentMethod,
  MessageDirection,
  Prisma,
  SubmissionMode,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CaseWithItems } from './mappers/case.mapper';

/** `_count.messages` — wiadomości od klienta (`Inbound`) jeszcze nieprzeczytane przez pracownika (`readAt=null`), patrz `MessagesRepository.markAllReadForCase`. Liczone tym samym zapytaniem co reszta sprawy (filtrowany count na relacji, Prisma 5.6+) — bez osobnego zapytania na listę spraw. */
const WITH_ITEMS = {
  // Etap 3 (Marki i konfiguracja procesu reklamacyjnego) — `product.brandId` doklejony
  // TU, jednym zapytaniem, żeby `resolveRequirements`/`resolveAttentionSla`
  // (`manufacturers/requirements-resolver.ts`) mogły nadpisać wymagania producenta
  // wymaganiami marki WSZĘDZIE, gdzie sprawa jest już ładowana z pozycjami — bez
  // dodatkowego zapytania per pozycja.
  items: { include: { product: { select: { brandId: true } } } },
  // Nazwa firmy-partnera zgłaszającej (formularz rozgałęziony marki, wariant "osobne
  // konto Dystrybutora") — TYLKO nazwa, żeby wyświetlić "Zgłoszenie od" bez ujawniania
  // pełnych danych partnera (adres/NIP), patrz `Case.reportedByPartnerCompanyId`.
  reportedByPartnerCompany: { select: { name: true } },
  _count: {
    select: {
      messages: { where: { direction: MessageDirection.Inbound, readAt: null } },
    },
  },
} as const;

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
    return this.prisma.case.findMany({
      where: { companyId },
      include: WITH_ITEMS,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Wyszukiwanie po numerze sprawy (dopasowanie częściowe) — wzorzec z `OrdersRepository.search`. */
  search(companyId: string, query: string): Promise<CaseWithItems[]> {
    return this.prisma.case.findMany({
      where: { companyId, caseNumber: { contains: query, mode: 'insensitive' } },
      include: WITH_ITEMS,
      take: 50,
    });
  }

  /** `companyId` obowiązkowy — bez niego to IDOR: dowolny zalogowany użytkownik dowolnej firmy mógłby odczytać/edytować cudzą sprawę, znając samo UUID (patrz audyt bezpieczeństwa, raport gotowości 1.0). */
  findById(id: string, companyId: string): Promise<CaseWithItems | null> {
    return this.prisma.case.findFirst({ where: { id, companyId }, include: WITH_ITEMS });
  }

  /** Bez `companyId` — WYŁĄCZNIE dla `PortalService`, gdzie `caseId` pochodzi z podpisanego, zweryfikowanego JWT Portalu (nie z parametru ścieżki sterowanego przez klienta), więc dodatkowy filtr nie zmienia bezpieczeństwa, patrz audyt bezpieczeństwa §9 ("Portal — SAFE"). */
  findByIdTrusted(id: string): Promise<CaseWithItems | null> {
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
  async findByIdForUpdate(
    id: string,
    companyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<CaseWithItems | null> {
    const locked = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "Case" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    if (locked.length === 0) return null;
    return tx.case.findFirst({ where: { id, companyId }, include: WITH_ITEMS });
  }

  /**
   * USER-003 (ERROR_CODES.md) — wołane z `UsersModule` (Zadanie 2) przy
   * dezaktywacji pracownika, żeby ostrzec, że jest właścicielem otwartych
   * spraw. Status Workflow Refactor — "status aktywny" nie jest już
   * hardcodowanym zbiorem 3 nazw enuma, tylko zbiorem kodów statusów
   * `isFinal=false` w per-firmowym katalogu; wołający (`CasesService`,
   * przez `CaseStatusesService`) dostarcza tę listę.
   */
  countActiveByOwner(ownerId: string, finalStatusCodes: string[]): Promise<number> {
    return this.prisma.case.count({
      where: { ownerId, status: { notIn: finalStatusCodes } },
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
      where: {
        companyId,
        createdAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      },
    });
  }

  /** Licznik "na całe życie" firmy — używany zamiast `countCreatedInYear` gdy admin wyłączy `caseNumberResetYearly` w Ustawieniach. */
  countCreatedTotal(companyId: string): Promise<number> {
    return this.prisma.case.count({ where: { companyId } });
  }

  /**
   * Producent/Dystrybutor + Partnerzy B2B (Faza 5) — domyka lukę opisaną w
   * komentarzu `countCreatedInYear` wyżej: skoro `caseNumber` jest unikalny
   * GLOBALNIE, kandydat na numer MUSI bazować na globalnym maksimum tego
   * prefiksu/roku (świeżo odczytanym przy KAŻDEJ próbie w `CasesService.
   * createWithUniqueCaseNumber`), nie na liczniku jednej firmy — inaczej dwie
   * firmy tworzące sprawy w bliskim odstępie czasu deterministycznie
   * wyczerpują pulę prób retry (zaobserwowane na żywo przy pierwszym teście
   * `CaseHandoffService.sendToPartner`: DAWIDAM i TekstylPro, licząc każda
   * WYŁĄCZNIE własne sprawy, wygenerowały ten sam numer). Sortowanie
   * leksykograficzne = numeryczne dzięki stałej szerokości zero-paddingu
   * (`caseNumberPadding`, jak dotąd niezmienianej w praktyce).
   */
  async findMaxSequenceInYear(prefix: string, year: number): Promise<number> {
    const row = await this.prisma.case.findFirst({
      where: { caseNumber: { startsWith: `${prefix}/${year}/` } },
      orderBy: { caseNumber: 'desc' },
      select: { caseNumber: true },
    });
    return row ? parseInt(row.caseNumber.split('/').pop()!, 10) : 0;
  }

  /** Odpowiednik `findMaxSequenceInYear` dla `caseNumberResetYearly=false` (format `{prefix}/{sekwencja}`, bez roku). */
  async findMaxSequenceTotal(prefix: string): Promise<number> {
    const row = await this.prisma.case.findFirst({
      where: { caseNumber: { startsWith: `${prefix}/` } },
      orderBy: { caseNumber: 'desc' },
      select: { caseNumber: true },
    });
    return row ? parseInt(row.caseNumber.split('/').pop()!, 10) : 0;
  }

  /**
   * Producent/Dystrybutor + Partnerzy B2B (Faza 5) — jedyne miejsce
   * ustawiające `Case.originType` na coś innego niż domyślne `DirectCustomer`
   * z `create()`. Wołane WYŁĄCZNIE przez `CaseHandoffService.sendToPartner`,
   * zaraz po utworzeniu sprawy w tenancie partnera — celowo NIE ma tego pola
   * w `CreateCaseDto` (żaden wołający publicznego/pracowniczego tworzenia
   * sprawy nie może podszyć się pod przekazanie B2B, ustawiając je wprost).
   */
  async setOriginType(id: string, originType: CaseOriginType): Promise<void> {
    await this.prisma.case.update({ where: { id }, data: { originType } });
  }

  create(
    companyId: string,
    caseNumber: string,
    data: {
      // Status Workflow Refactor — `Case.status` nie ma już `@default(Nowa)`
      // (nie ma czego domyślnie ustawić bez znajomości per-firmowego
      // katalogu) — `CasesService.create` MUSI podać kod jawnie, odczytany
      // z `CaseStatusDefinition.isDefaultForNew`.
      status: string;
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
      // Formularz rozgałęziony marki (np. Veres Meble) — patrz komentarz przy `Case.reportedByContractorId` w schemacie.
      reportedByContractorId?: string | null;
      reportedByPartnerCompanyId?: string | null;
      contactPreference?: CaseContactPreference | null;
      notificationSenderName?: string | null;
      items: Array<{
        orderItemId?: string;
        productId: string;
        manufacturerId?: string;
        description: string;
        serialNumber?: string | null;
        frameNumber?: string | null;
        purchaseDate?: Date | null;
        purchaseProofNumber?: string | null;
      }>;
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
    data: Partial<Pick<Case, 'requestedResolution' | 'description' | 'priority' | 'complaintType'>>,
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
    status: string,
    extra: Partial<
      Pick<
        Case,
        | 'closedAt'
        | 'cancelledAt'
        | 'archivedAt'
        | 'nextAction'
        | 'statusChangedAt'
        | 'attentionNotifiedAt'
      >
    > = {},
    client: PrismaClientLike = this.prisma,
  ): Promise<CaseWithItems> {
    return client.case.update({ where: { id }, data: { status, ...extra }, include: WITH_ITEMS });
  }

  setDecision(
    id: string,
    decision: Decision,
    decisionByUserId: string,
    requiresManagerApproval: boolean,
    nextAction: string | undefined,
    extra: {
      decisionIsPositive: boolean;
      decisionContractorId?: string;
      decisionJustification?: string;
      decisionFulfillmentMethod?: DecisionFulfillmentMethod;
      decisionManufacturerResponse?: string;
    },
    client: PrismaClientLike = this.prisma,
  ): Promise<CaseWithItems> {
    return client.case.update({
      where: { id },
      data: {
        decision,
        decisionByUserId,
        decisionAt: new Date(),
        requiresManagerApproval,
        decisionIsPositive: extra.decisionIsPositive,
        decisionContractorId: extra.decisionContractorId,
        decisionJustification: extra.decisionJustification,
        decisionFulfillmentMethod: extra.decisionFulfillmentMethod,
        decisionManufacturerResponse: extra.decisionManufacturerResponse,
        ...(nextAction !== undefined ? { nextAction } : {}),
      },
      include: WITH_ITEMS,
    });
  }

  setPriority(id: string, priority: CasePriority): Promise<CaseWithItems> {
    return this.prisma.case.update({ where: { id }, data: { priority }, include: WITH_ITEMS });
  }

  assignOwner(
    id: string,
    ownerId: string,
    client: PrismaClientLike = this.prisma,
  ): Promise<CaseWithItems> {
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
    return this.prisma.case.update({
      where: { id },
      data: { clientLastLoginAt: new Date() },
      include: WITH_ITEMS,
    });
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

  /** `cases.delete` (RBAC.md §5, jedyny hard-delete w aplikacji) — na wyraźne żądanie właściciela, wyłącznie dla usuwania spraw testowych. */
  deleteLogisticsForCase(caseId: string, client: PrismaClientLike = this.prisma) {
    return client.logistics.deleteMany({ where: { caseId } });
  }

  /** `cases.delete` (RBAC.md §5) — usuwa sam wiersz `Case`; wołający (`CasesService.hardDelete`) musi wcześniej, w TEJ SAMEJ transakcji, wyczyścić wszystkie tabele zależne (kolejność FK) — patrz doc-comment przy `CasesService.hardDelete`. */
  hardDelete(id: string, client: PrismaClientLike = this.prisma) {
    return client.case.delete({ where: { id } });
  }

  /**
   * Przypomnienia o reakcji — kandydaci do skanu (`CaseAttentionScannerService`):
   * sprawy z właścicielem, które jeszcze nie dostały powiadomienia od
   * ostatniej zmiany statusu (`attentionNotifiedAt=null`, zerowane przy
   * KAŻDEJ realnej zmianie statusu, patrz `performTransition`). Celowo BEZ
   * filtra po statusie/firmie tutaj — sprawy w statusie końcowym i tak nigdy
   * nie "wymagają reakcji" (`computeCaseAttention`), a wołający grupuje
   * wynik po `companyId`, żeby doliczyć próg per firma/producent jednym
   * zapytaniem na firmę zamiast N+1 na sprawę.
   */
  findCandidatesForAttentionScan(): Promise<
    {
      id: string;
      companyId: string;
      caseNumber: string;
      status: string;
      statusChangedAt: Date;
      createdAt: Date;
      ownerId: string | null;
      items: { manufacturerId: string | null; product: { brandId: string | null } }[];
    }[]
  > {
    return this.prisma.case.findMany({
      where: { attentionNotifiedAt: null, ownerId: { not: null } },
      select: {
        id: true,
        companyId: true,
        caseNumber: true,
        status: true,
        statusChangedAt: true,
        createdAt: true,
        ownerId: true,
        items: {
          take: 1,
          select: { manufacturerId: true, product: { select: { brandId: true } } },
        },
      },
    });
  }

  markAttentionNotified(id: string): Promise<void> {
    return this.prisma.case
      .update({ where: { id }, data: { attentionNotifiedAt: new Date() } })
      .then(() => undefined);
  }
}
