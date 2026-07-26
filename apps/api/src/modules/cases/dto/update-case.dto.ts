import { ApiPropertyOptional } from '@nestjs/swagger';
import { CasePriority } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/** `cases.edit` — pola opisowe, NIE status/decyzja (mają własne endpointy/DTO, WORKFLOW.md §8). */
export class UpdateCaseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() requestedResolution?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: CasePriority }) @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
}
