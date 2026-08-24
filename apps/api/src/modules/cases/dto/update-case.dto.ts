import { ApiPropertyOptional } from '@nestjs/swagger';
import { CasePriority, ComplaintType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/** `cases.edit` — pola opisowe, NIE status/decyzja (mają własne endpointy/DTO, WORKFLOW.md §8). */
export class UpdateCaseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() requestedResolution?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: CasePriority })
  @IsOptional()
  @IsEnum(CasePriority)
  priority?: CasePriority;
  /** Publiczny Formularz Reklamacyjny nie pyta klienta o ten wybór (BR — na życzenie właściciela) — pracownik ustawia go tutaj podczas weryfikacji. Zmiana zablokowana po opuszczeniu `Weryfikacja` (CASE-014, patrz `CasesService.update`). */
  @ApiPropertyOptional({ enum: ComplaintType })
  @IsOptional()
  @IsEnum(ComplaintType)
  complaintType?: ComplaintType;
}
