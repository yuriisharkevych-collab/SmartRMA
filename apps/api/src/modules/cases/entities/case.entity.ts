import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CaseContactPreference,
  CaseOriginType,
  CasePriority,
  ComplaintSource,
  ComplaintType,
  Decision,
  DecisionFulfillmentMethod,
  SubmissionMode,
} from '@prisma/client';
import { CaseItemEntity } from './case-item.entity';

export class CaseEntity {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiPropertyOptional({ nullable: true }) shopId!: string | null;
  @ApiProperty() caseNumber!: string;
  @ApiProperty() customerId!: string;
  @ApiPropertyOptional({ nullable: true }) ownerId!: string | null;

  @ApiProperty({ enum: ComplaintType }) complaintType!: ComplaintType;
  @ApiProperty({ enum: SubmissionMode }) submissionMode!: SubmissionMode;
  @ApiProperty({ enum: ComplaintSource }) source!: ComplaintSource;
  /** Producent/Dystrybutor + Partnerzy B2B (Faza 5) — skąd sprawa trafiła do TEJ organizacji (`DirectCustomer` domyślnie; `PartnerB2B` wyłącznie przez `CaseHandoffService.sendToPartner`). Niezależne od `source` (kanał zgłoszenia klienta). */
  @ApiProperty({ enum: CaseOriginType }) originType!: CaseOriginType;
  /** Formularz rozgałęziony marki (np. Veres Meble) — `Contractor` (category=Distributor), który zgłosił sprawę jako partner B2B. `null` dla zwykłych zgłoszeń B2C. */
  @ApiPropertyOptional({ nullable: true }) reportedByContractorId!: string | null;
  /** Z kim prowadzić dalszy kontakt, gdy partner zgłosił sprawę W IMIENIU klienta końcowego — `null`, gdy nie dotyczy. */
  /** Formularz rozgałęziony marki, wariant "osobne konto Dystrybutora" — realna `Company` powiązana Partnership, patrz komentarz przy `Case.reportedByPartnerCompanyId` w schemacie. `null` dla zwykłych B2C. */
  @ApiPropertyOptional({ nullable: true }) reportedByPartnerCompanyId!: string | null;
  @ApiPropertyOptional({ nullable: true }) reportedByPartnerCompanyName!: string | null;
  @ApiPropertyOptional({ enum: CaseContactPreference, nullable: true })
  contactPreference!: CaseContactPreference | null;
  /** Nazwa nadawcy e-mail dla WSZYSTKICH przyszłych powiadomień tej sprawy (np. "Veres Meble"), patrz komentarz przy tym polu w schemacie. `null` = nazwa firmy z Ustawienia → E-mail. */
  @ApiPropertyOptional({ nullable: true }) notificationSenderName!: string | null;

  /** WORKFLOW.md §3.2 (BR-105) — NULL dla ścieżki "bezpośrednio do producenta" (minimalny zestaw danych), patrz `CasesService.createCase`. */
  @ApiPropertyOptional({ nullable: true }) requestedResolution!: string | null;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiPropertyOptional({ nullable: true }) customerStatement!: string | null;

  /** Kod z per-firma katalogu `CaseStatusDefinition.code` (Status Workflow Refactor) — nie enum, patrz komentarz przy `Case.status` w schema.prisma. */
  @ApiProperty() status!: string;
  @ApiProperty({ enum: CasePriority }) priority!: CasePriority;

  @ApiPropertyOptional({ enum: Decision, nullable: true }) decision!: Decision | null;
  @ApiPropertyOptional({ nullable: true }) decisionAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) decisionByUserId!: string | null;
  @ApiPropertyOptional({ nullable: true }) decisionContractorId!: string | null;
  @ApiPropertyOptional({ nullable: true }) decisionIsPositive!: boolean | null;
  @ApiPropertyOptional({ nullable: true }) decisionJustification!: string | null;
  @ApiPropertyOptional({ enum: DecisionFulfillmentMethod, nullable: true })
  decisionFulfillmentMethod!: DecisionFulfillmentMethod | null;
  @ApiPropertyOptional({ nullable: true }) decisionManufacturerResponse!: string | null;

  @ApiPropertyOptional({ nullable: true }) nextAction!: string | null;
  @ApiPropertyOptional({ nullable: true }) nextActionDueDate!: Date | null;

  @ApiProperty() requiresManagerApproval!: boolean;
  @ApiProperty() isException!: boolean;
  @ApiProperty() clientPortalEnabled!: boolean;
  /** Kiedy klient ostatnio zalogował się do Portalu (`null` = jeszcze nigdy). Hashe kodu/tokenu NIE są wystawiane — patrz `CaseMapper.toEntity`. */
  @ApiPropertyOptional({ nullable: true }) clientLastLoginAt!: Date | null;

  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ nullable: true }) closedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) cancelledAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) archivedAt!: Date | null;

  /** Data ostatniej REALNEJ zmiany statusu (nie aktualizowana przez idempotentny no-op) — podstawa progu "przypomnienia o reakcji", patrz `case-attention.util.ts`. */
  @ApiProperty() statusChangedAt!: Date;
  /** Wyliczone przez `CasesService` (nie mapper — wymaga ustawień firmy/producenta) — `true`, gdy sprawa przekroczyła próg "brak zmiany statusu" i/lub "dni od zgłoszenia". Sprawa w statusie końcowym nigdy nie wymaga reakcji. */
  @ApiProperty() needsAttention!: boolean;
  @ApiProperty({ enum: ['StatusStale', 'CaseAgeStale'], isArray: true })
  attentionReasons!: string[];
  /** Wyliczone przez `CasesService.attachWaitingForCustomer` (Etap 2 — Dashboard Producenta/Dystrybutora) — `true`, gdy sprawa B2C ma wysłaną prośbę o uzupełnienie danych I nadal ma niespełnione wymagania. Zawsze `false` dla spraw B2B (patrz doc-comment tej metody). */
  @ApiProperty() waitingForCustomer!: boolean;

  @ApiProperty({ type: [CaseItemEntity] }) items!: CaseItemEntity[];
  /** Wiadomości od klienta jeszcze nieprzeczytane przez pracownika — `CasesRepository`'s `_count` (filtrowany na `direction=Inbound, readAt=null`). Zerowane przez `POST /cases/:id/messages/read`. */
  @ApiProperty() unreadMessagesCount!: number;
}
