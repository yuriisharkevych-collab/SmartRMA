import { ApiProperty } from '@nestjs/swagger';
import { DocumentCategory } from '@prisma/client';

/**
 * Portal Klienta — "Uzupełnienie reklamacji" (najważniejsza funkcja modułu wg
 * zadania). Jeden wpis = JEDNO wymaganie producenta dla JEDNEJ pozycji sprawy
 * (numer seryjny/ramy/dowód zakupu jako POLE, albo zdjęcia/wideo/dowód zakupu
 * jako ZAŁĄCZNIK — `kind` odróżnia, co ma zrobić przycisk "Uzupełnij" we
 * froncie: otworzyć pole tekstowe czy wybór pliku).
 *
 * CELOWO osobne od `assertRequiredDocuments`/`assertManufacturerRequirements`
 * w `CasesService` (CASE-002/004/005/006) — tamte są bramkami rzucającymi
 * wyjątek w konkretnych, już przetestowanych momentach procesu (utworzenie
 * sprawy / przejście statusu). To jest CZWARTY, nowy, nie-rzucający odczyt
 * "co jeszcze brakuje" na potrzeby Portalu — współdzielenie kodu z tamtymi
 * bramkami wymagałoby ryzykownej refaktoryzacji dobrze pokrytego testami
 * kodu dla korzyści nieproporcjonalnej do ryzyka regresji.
 */
export class CaseCompletenessItemEntity {
  @ApiProperty() code!: string;
  @ApiProperty() itemId!: string;
  @ApiProperty() label!: string;
  @ApiProperty() satisfied!: boolean;
  @ApiProperty({ enum: ['field', 'document'] }) kind!: 'field' | 'document';
  @ApiProperty({ required: false, nullable: true })
  field?: 'serialNumber' | 'frameNumber' | 'purchaseProofNumber';
  @ApiProperty({ enum: DocumentCategory, required: false, nullable: true })
  category?: DocumentCategory;
}

export class CaseCompletenessEntity {
  @ApiProperty({ type: [CaseCompletenessItemEntity] }) requirements!: CaseCompletenessItemEntity[];
  @ApiProperty() complete!: boolean;
}
