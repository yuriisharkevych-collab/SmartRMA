import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubmissionMethod, TransportOrganizer } from '@prisma/client';

export class ManufacturerSlaEntity {
  @ApiPropertyOptional({ nullable: true }) responseDays!: number | null;
  @ApiPropertyOptional({ nullable: true }) repairDays!: number | null;
  @ApiPropertyOptional({ nullable: true }) reminderAfterDays!: number | null;
  @ApiPropertyOptional({ nullable: true }) escalationAfterDays!: number | null;
  @ApiPropertyOptional({
    nullable: true,
    description: '`null` = użyj wartości domyślnej z Ustawień → Przypomnienia.',
  })
  statusStaleDaysOverride!: number | null;
  @ApiPropertyOptional({
    nullable: true,
    description: '`null` = użyj wartości domyślnej z Ustawień → Przypomnienia.',
  })
  caseAgeStaleDaysOverride!: number | null;
}

/** `ManufacturerLogistics` (DATABASE.md §"Manufacturer" — osobna tabela 1:1, celowo NIE JSON). `null` na całym obiekcie = producent nie ma jeszcze skonfigurowanej logistyki. */
export class ManufacturerLogisticsEntity {
  @ApiPropertyOptional({ nullable: true }) returnAddress!: string | null;
  @ApiProperty({ enum: TransportOrganizer }) transportOrganizer!: TransportOrganizer;
  @ApiProperty() manufacturerProvidesLabel!: boolean;
  @ApiProperty() shopCanOrderCourier!: boolean;
  @ApiProperty({ description: 'Kwota w zł (Decimal w bazie — serializowany jako string).' })
  shopCourierCost!: string;
  @ApiProperty() originalPackagingRequired!: boolean;
  @ApiProperty() substitutePackagingAllowed!: boolean;
  @ApiPropertyOptional({ nullable: true }) transportProtectionNote!: string | null;
  @ApiPropertyOptional({ nullable: true }) productConditionNote!: string | null;
}

/**
 * `ManufacturerAutomation`. Brak odpowiedników `autoReminders`/
 * `autoEscalation` z prototypu jest CELOWY — `schema.prisma` (komentarz nad
 * `ManufacturerSLA`) zastąpił te dwa booleany progami dniowymi
 * `sla.reminderAfterDays`/`sla.escalationAfterDays`, gdzie `null` = wyłączone;
 * jedno źródło prawdy zamiast flagi i progu, które mogłyby się rozjechać.
 */
export class ManufacturerAutomationEntity {
  @ApiProperty() autoEmailEnabled!: boolean;
  @ApiProperty() autoCloseEnabled!: boolean;
  @ApiProperty() autoCloseDays!: number;
}

export class ManufacturerEntity {
  @ApiProperty() id!: string;
  @ApiProperty() contractorId!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ enum: SubmissionMethod }) submissionMethod!: SubmissionMethod;
  @ApiPropertyOptional({ nullable: true }) portalUrl!: string | null;
  @ApiPropertyOptional({ nullable: true }) portalLogin!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Etap 6 — adres formularza rozgałęzionego marki (`/reklamacja-marka/:slug`), np. Veres Meble. `null` = ten producent nie ma własnego formularza.',
  })
  publicFormSlug!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Nazwa marki pokazywana na formularzu marki — `null` dziedziczy nazwę kontrahenta.',
  })
  publicFormDisplayName!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Ścieżka względna do `GET /manufacturers/:id/logo` (publiczny) — `null`, gdy ten producent nie ma jeszcze wgranego logo formularza marki.',
  })
  publicFormLogoUrl!: string | null;

  @ApiPropertyOptional({ nullable: true }) complaintProcedure!: string | null;
  @ApiPropertyOptional({ nullable: true }) requiredDocumentsNote!: string | null;
  @ApiPropertyOptional({ nullable: true }) requiredPhotosNote!: string | null;
  @ApiPropertyOptional({ nullable: true }) requiredVideosNote!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Skrzynka reklamacyjna producenta — odrębna od ogólnego kontaktu na Contractor.',
  })
  complaintEmail!: string | null;

  @ApiProperty() requiresSerialNumber!: boolean;
  @ApiProperty() requiresFrameNumber!: boolean;
  @ApiProperty() requiresProofOfPurchase!: boolean;

  /** Wymagania EGZEKWOWALNE przy zmianie statusu (CASE-002). `minPhotos=0` = brak wymogu. */
  @ApiProperty() minPhotos!: number;
  @ApiProperty() requiresVideo!: boolean;

  @ApiProperty() maxPhotos!: number;
  @ApiProperty() maxAttachmentSizeMb!: number;
  @ApiProperty() active!: boolean;

  @ApiPropertyOptional({ type: ManufacturerSlaEntity, nullable: true })
  sla!: ManufacturerSlaEntity | null;

  @ApiPropertyOptional({ type: ManufacturerLogisticsEntity, nullable: true })
  logistics!: ManufacturerLogisticsEntity | null;

  @ApiPropertyOptional({ type: ManufacturerAutomationEntity, nullable: true })
  automation!: ManufacturerAutomationEntity | null;
}
