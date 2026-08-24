import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationKind, OrganizationType } from '@prisma/client';

export class CompanyEntity {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  /** Etap 2 (Dashboard Producenta/Dystrybutora) — brakowało tego pola w API mimo że istnieje w schemacie od Fazy 2; front nie miał jak rozróżnić typu organizacji. */
  @ApiProperty({ enum: OrganizationType }) type!: OrganizationType;
  @ApiPropertyOptional({ enum: OrganizationKind, nullable: true })
  orgKind!: OrganizationKind | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Publiczny Formularz Reklamacyjny — `/reklamacja/:orgSlug` tej organizacji.',
  })
  slug!: string | null;
  @ApiPropertyOptional({ nullable: true }) nip!: string | null;
  @ApiPropertyOptional({ nullable: true }) regon!: string | null;
  @ApiPropertyOptional({ nullable: true }) address!: string | null;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true }) website!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Portal Klienta — link "Polityka Prywatności" pod sekcją RODO formularza.',
  })
  privacyPolicyUrl!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Opcjonalne oznaczenie wersji polityki prywatności, zapisywane jako migawka przy każdej zgodzie RODO (CaseConsent).',
  })
  privacyPolicyVersion!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Publiczny Formularz Reklamacyjny — link "Regulamin" na kroku RODO.',
  })
  termsUrl!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Ścieżka do GET /companies/:id/logo (publiczny — logo nie jest danymą wrażliwą, potrzebny na wydrukach/w portalu klienta).',
  })
  logoUrl!: string | null;
  @ApiProperty() active!: boolean;
}
