import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SettingValueType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/** `settings.manage`. companyId=null (globalne) ustawiane wyłącznie przez seed, nie ten endpoint (DATABASE.md §30). */
export class UpsertSettingDto {
  @ApiProperty() @IsString() key!: string;
  @ApiProperty({ description: 'Dowolna wartość JSON.' }) value!: unknown;
  @ApiPropertyOptional({ enum: SettingValueType }) @IsOptional() @IsEnum(SettingValueType) type?: SettingValueType;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}
