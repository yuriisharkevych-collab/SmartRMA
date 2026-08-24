import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Decision } from '@prisma/client';

/**
 * Wąski widok JEDNEJ strony wątku przekazania (plan Fazy 5/6) — WYŁĄCZNIE
 * status/decyzja/numer sprawy/nazwa organizacji drugiej strony. NIGDY
 * notatki, wiadomości, dokumenty ani pełne dane klienta drugiej strony —
 * patrz `CaseHandoffService.getThread`.
 */
export class HandoffThreadSide {
  @ApiProperty() companyName!: string;
  @ApiProperty() caseNumber!: string;
  @ApiProperty() status!: string;
  @ApiProperty() statusLabel!: string;
  @ApiPropertyOptional({ enum: Decision, nullable: true }) decision!: Decision | null;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty() createdAt!: Date;
}

/**
 * Faza 6 (trasy wieloetapowe) — sprawa "w środku" łańcucha (np. Dystrybutor
 * w Sklep→Dystrybutor→Producent) jest JEDNOCZEŚNIE celem jednego przekazania
 * i źródłem drugiego, więc oba kierunki muszą być widoczne naraz — stąd dwa
 * NIEZALEŻNE, nullable pola zamiast pojedynczego `direction`. Sprawa
 * niezaangażowana w żadne przekazanie: oba `null`.
 */
export class HandoffThreadEntity {
  @ApiPropertyOptional({ type: HandoffThreadSide, nullable: true })
  receivedFrom!: HandoffThreadSide | null;
  @ApiPropertyOptional({ type: HandoffThreadSide, nullable: true })
  sentTo!: HandoffThreadSide | null;
}
