import { ApiPropertyOptional } from '@nestjs/swagger';
import { TransportOrganizer } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** `manufacturers.manage`. Wszystkie pola opcjonalne — upsert częściowy (`ManufacturerLogistics` powstaje przy pierwszym zapisie, patrz `ManufacturersRepository.upsertLogistics`). */
export class UpdateManufacturerLogisticsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() returnAddress?: string;
  @ApiPropertyOptional({ enum: TransportOrganizer })
  @IsOptional()
  @IsEnum(TransportOrganizer)
  transportOrganizer?: TransportOrganizer;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() manufacturerProvidesLabel?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() shopCanOrderCourier?: boolean;
  @ApiPropertyOptional({
    description: 'Kwota w zł, dwie cyfry po przecinku (Decimal(10,2) w bazie).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  shopCourierCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() originalPackagingRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() substitutePackagingAllowed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() transportProtectionNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() productConditionNote?: string;
}
