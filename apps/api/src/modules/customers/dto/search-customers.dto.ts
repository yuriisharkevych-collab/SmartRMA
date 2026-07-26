import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** Wyszukiwanie przy rejestracji reklamacji (BR-011 z dokumentu źródłowego) — po nazwisku/telefonie/e-mailu. */
export class SearchCustomersDto {
  @ApiPropertyOptional() @IsOptional() @IsString() query?: string;
}
