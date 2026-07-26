import { ApiProperty } from '@nestjs/swagger';

/** Odpowiednik `getManufacturerStats()` z prototypu (DECISIONS.md, "Rozbudowa panelu administracyjnego") — liczone z rzeczywistych danych, nie mockowane. */
export class ManufacturerReportEntity {
  @ApiProperty() manufacturerId!: string;
  @ApiProperty() caseCount!: number;
  @ApiProperty({ nullable: true, description: 'Średni czas realizacji zamkniętych spraw, w dniach.' })
  averageResolutionDays!: number | null;
}
