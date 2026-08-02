import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/**
 * `manufacturers.manage`. Brak `autoReminders`/`autoEscalation` jest CELOWY —
 * te dwa booleany z prototypu zostały zastąpione progami dniowymi
 * `ManufacturerSLA.reminderAfterDays`/`escalationAfterDays` (`null` =
 * wyłączone), patrz komentarz nad `ManufacturerSLA` w `schema.prisma`.
 * Ustawia się je przez `PUT /manufacturers/:id/sla`.
 */
export class UpdateManufacturerAutomationDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoEmailEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoCloseEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) autoCloseDays?: number;
}
