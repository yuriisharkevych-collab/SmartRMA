import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ComplaintSource, ComplaintType, SubmissionMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class CreateCaseItemDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() orderItemId?: string;
  @ApiProperty() @IsUUID() productId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() manufacturerId?: string;
  @ApiProperty() @IsString() description!: string;
}

/**
 * `cases.create`. Warunek CASE-007/BR-097 (submissionMode vs. complaintType)
 * NIE jest walidowany tutaj — DTO tylko kształtuje wejście, regułę
 * egzekwuje `CasesService` (Zadanie 16).
 *
 * `requestedResolution`/`description` są tu OPCJONALNE na poziomie DTO —
 * `schema.prisma` ma je nullable (decyzja końcowa, DECISIONS.md "Zadanie 9"),
 * bo ścieżka `submissionMode=BezposrednioDoProducenta` (WORKFLOW.md §3.2,
 * "sprawa minimalna monitorowana") tworzy sprawę bez tych pól — producent
 * zbiera opis usterki bezpośrednio. Dla KAŻDEJ innej ścieżki oba pola są
 * wymagane WARSTWĄ APLIKACJI (BR-105), egzekwowane w `CasesService.create`,
 * nie tutaj (DTO nie zna wartości `submissionMode` w momencie własnej
 * walidacji pola po polu — warunek jest międzypolowy).
 */
export class CreateCaseDto {
  @ApiProperty() @IsUUID() customerId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() shopId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() ownerId?: string;

  @ApiProperty({ enum: ComplaintType }) @IsEnum(ComplaintType) complaintType!: ComplaintType;
  @ApiPropertyOptional({ enum: SubmissionMode }) @IsOptional() @IsEnum(SubmissionMode) submissionMode?: SubmissionMode;
  @ApiPropertyOptional({ enum: ComplaintSource }) @IsOptional() @IsEnum(ComplaintSource) source?: ComplaintSource;

  @ApiPropertyOptional() @IsOptional() @IsString() requestedResolution?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerStatement?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() deliveryAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() courierRequested?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() preparationFeeAccepted?: boolean;

  /**
   * Zadanie 18 (Notifications) — dodane, żeby zamknąć lukę: bez tego pola
   * `clientPortalEnabled` był ustawialny WYŁĄCZNIE przez `POST /cases/:id/
   * portal/enable` (osobne wywołanie PO utworzeniu sprawy), więc warunek z
   * WORKFLOW.md §6 poz. 1 ("wysłanie Notification... jeśli
   * clientPortalEnabled=true — [już] przy utworzeniu sprawy") nigdy nie
   * mógł być spełniony w praktyce — `case.created` publikuje się raz, przy
   * tworzeniu, zanim jakikolwiek późniejszy `/portal/enable` mógłby to
   * zmienić. `CasesRepository.create()` już przyjmował to pole (Zadanie 16),
   * brakowało wyłącznie ścieżki z DTO/serwisu — czysto addytywna poprawka,
   * bez zmiany modelu danych/RBAC.
   */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() clientPortalEnabled?: boolean;

  @ApiProperty({ type: [CreateCaseItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateCaseItemDto)
  items!: CreateCaseItemDto[];
}
