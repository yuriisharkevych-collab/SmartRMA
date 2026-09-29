import { ApiProperty } from '@nestjs/swagger';
import { OrganizationType } from '@prisma/client';

/**
 * `POST /partnerships/search-company` (Etap 6) — WYŁĄCZNIE dane bezpieczne do
 * potwierdzenia "czy to właściwa firma" (BR: bezpieczeństwo tenantów, patrz
 * doc-comment `PartnershipsService.searchCompanyByNip`). Celowo BRAK: adresu,
 * e-maila/telefonu firmy, listy użytkowników, produktów, marek, reklamacji,
 * ustawień — tego typu dane widzi WYŁĄCZNIE firma-właściciel, przez własne
 * `GET /companies/me`.
 */
export class SearchCompanyResultEntity {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() nip!: string;
  @ApiProperty({ enum: OrganizationType }) type!: OrganizationType;
  /** `true` = istnieje między tą firmą a wołającym partnerstwo `status=Active`. */
  @ApiProperty() alreadyConnected!: boolean;
  /** `true` = istnieje między tą firmą a wołającym partnerstwo `status=Invited` (oczekująca prośba, w dowolną stronę). */
  @ApiProperty() pendingRequest!: boolean;
}
