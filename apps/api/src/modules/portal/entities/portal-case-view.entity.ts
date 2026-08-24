import { ApiProperty } from '@nestjs/swagger';
import { PortalCompanyInfoEntity } from './portal-company-info.entity';

/** BR-081 — 5 etapów ogólnych + 2 stany specjalne (WORKFLOW.md §7, kolumna "Publiczny etap"). */
export type PortalStage =
  'Zgloszona' | 'Przyjeta' | 'WTrakcie' | 'Decyzja' | 'Zakonczona' | 'Anulowana' | 'Zarchiwizowana';

export const PORTAL_STAGE_LABELS: Record<PortalStage, string> = {
  Zgloszona: 'Zgłoszona',
  Przyjeta: 'Przyjęta do realizacji',
  WTrakcie: 'W trakcie rozpatrywania',
  Decyzja: 'Decyzja podjęta',
  Zakonczona: 'Zakończona',
  Anulowana: 'Anulowana',
  Zarchiwizowana: 'Zarchiwizowana',
};

/** Kolejność 5 GŁÓWNYCH etapów na pasku postępu — `Anulowana`/`Zarchiwizowana` to stany specjalne, pokazywane frontendowi jako baner zamiast punktu na osi (patrz `stageIndex=0`). */
export const PORTAL_STAGE_SEQUENCE: readonly PortalStage[] = [
  'Zgloszona',
  'Przyjeta',
  'WTrakcie',
  'Decyzja',
  'Zakonczona',
];

/** RBAC.md §3a — wyłącznie imię, nazwisko, rola. Nigdy e-mail/telefon prywatny. */
export class PortalOwnerEntity {
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
}

/**
 * Widok sprawy dla klienta — BR-081 (nigdy surowy `CaseStatus`) + BR-079
 * (historia/dokumenty filtrowane osobno, patrz `PortalService`). To jest
 * jedyne miejsce po stronie backendu, które zna mapowanie `CaseStatus` →
 * 5 etapów publicznych — odpowiednik `public-status-mapper.js` z prototypu.
 */
export class PortalCaseViewEntity {
  @ApiProperty() caseNumber!: string;
  @ApiProperty({
    enum: [
      'Zgloszona',
      'Przyjeta',
      'WTrakcie',
      'Decyzja',
      'Zakonczona',
      'Anulowana',
      'Zarchiwizowana',
    ],
  })
  stage!: PortalStage;
  @ApiProperty() stageLabel!: string;
  /** Pozycja na 5-punktowym pasku postępu (1-5) — `0`, gdy sprawa jest w stanie specjalnym (Anulowana/Zarchiwizowana), frontend pokazuje wtedy baner zamiast stepperu. */
  @ApiProperty() stageIndex!: number;
  @ApiProperty() stageCount!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ nullable: true }) decisionLabel!: string | null;
  @ApiProperty({ type: PortalOwnerEntity, nullable: true }) owner!: PortalOwnerEntity | null;
  @ApiProperty({ type: PortalCompanyInfoEntity }) companyInfo!: PortalCompanyInfoEntity;
  @ApiProperty({ description: 'Czy dla tej sprawy zapisano już zgodę RODO (co najmniej raz).' })
  consentGiven!: boolean;
  @ApiProperty() gdprClauseVersion!: string;
  @ApiProperty() gdprInfoText!: string;
  @ApiProperty() gdprRequiredConsentText!: string;
  @ApiProperty() gdprMarketingConsentText!: string;
  @ApiProperty() gdprDocumentSharingConsentText!: string;
  /** Wiadomości od pracownika (`Outbound`) jeszcze nieprzeczytane przez klienta — czerwony znacznik na zakładce Wiadomości w Portalu. */
  @ApiProperty() unreadMessagesCount!: number;
}
