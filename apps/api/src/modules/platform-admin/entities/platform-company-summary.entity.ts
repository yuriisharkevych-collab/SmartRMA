import { ApiProperty } from '@nestjs/swagger';

/**
 * `GET /platform-admin/companies` — WYŁĄCZNIE pola potrzebne do przeglądu
 * "ile firm, jakiego typu, czy aktywne" (fresh-install/onboarding overview).
 * Świadomie BEZ: użytkowników, spraw, katalogu, ustawień e-mail, logo — patrz
 * "Nie dawaj automatycznie Platform Adminowi pełnego dostępu do danych
 * wszystkich tenantów bez jawnego mechanizmu/autoryzacji" w treści zadania.
 */
export class PlatformCompanySummaryEntity {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() type!: string;
  @ApiProperty({ nullable: true }) orgKind!: string | null;
  @ApiProperty() active!: boolean;
  @ApiProperty() createdAt!: string;
}
