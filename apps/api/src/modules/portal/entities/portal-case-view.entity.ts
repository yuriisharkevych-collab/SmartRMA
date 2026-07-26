import { ApiProperty } from '@nestjs/swagger';

/** BR-081 — 5 etapów ogólnych + 2 stany specjalne (WORKFLOW.md §7, kolumna "Publiczny etap"). */
export type PortalStage =
  | 'Zgloszona'
  | 'Przyjeta'
  | 'WTrakcie'
  | 'Decyzja'
  | 'Zakonczona'
  | 'Anulowana'
  | 'Zarchiwizowana';

export const PORTAL_STAGE_LABELS: Record<PortalStage, string> = {
  Zgloszona: 'Zgłoszona',
  Przyjeta: 'Przyjęta do realizacji',
  WTrakcie: 'W trakcie rozpatrywania',
  Decyzja: 'Decyzja podjęta',
  Zakonczona: 'Zakończona',
  Anulowana: 'Anulowana',
  Zarchiwizowana: 'Zarchiwizowana',
};

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
  @ApiProperty({ enum: ['Zgloszona', 'Przyjeta', 'WTrakcie', 'Decyzja', 'Zakonczona', 'Anulowana', 'Zarchiwizowana'] })
  stage!: PortalStage;
  @ApiProperty() stageLabel!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ nullable: true }) decisionLabel!: string | null;
  @ApiProperty({ type: PortalOwnerEntity, nullable: true }) owner!: PortalOwnerEntity | null;
}
