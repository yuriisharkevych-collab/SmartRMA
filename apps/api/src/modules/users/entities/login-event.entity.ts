import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** `LoginEvent` (DATABASE.md §9, BR-089) — pojedyncza próba logowania. Bez `userId`: endpoint jest zagnieżdżony pod `/users/:id`, więc byłby redundantny. */
export class LoginEventEntity {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) ipAddress!: string | null;
  @ApiPropertyOptional({ nullable: true }) userAgent!: string | null;
  @ApiProperty({ description: 'false = próba nieudana (błędne hasło lub konto nieaktywne).' })
  success!: boolean;
  @ApiProperty() createdAt!: Date;
}
