import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SettingValueType } from '@prisma/client';

export class SettingEntity {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true, description: 'null = wartość domyślna systemu.' }) companyId!: string | null;
  @ApiProperty() key!: string;
  @ApiProperty() value!: unknown;
  @ApiProperty({ enum: SettingValueType }) type!: SettingValueType;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
}
