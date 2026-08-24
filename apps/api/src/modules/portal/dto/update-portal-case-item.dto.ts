import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Portal Klienta — uzupełnienie danych egzemplarza (checklist "Uzupełnienie reklamacji"). */
export class UpdatePortalCaseItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) frameNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) purchaseProofNumber?: string;
}
