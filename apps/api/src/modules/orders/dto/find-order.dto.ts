import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** Wyszukiwanie w kreatorze zgłoszenia (WORKFLOW.md §6 poz. 12) — ORDER-001, jeśli brak trafienia (nie błąd). */
export class FindOrderDto {
  @ApiProperty() @IsString() orderNumber!: string;
}
