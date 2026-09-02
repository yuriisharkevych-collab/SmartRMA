import { ApiProperty } from '@nestjs/swagger';

/** `GET /partnerships/invite/:token` (publiczny) — pokazuje zaproszonemu KTO go zaprasza i DO CZEGO, zanim założy konto. Wyłącznie bezpieczne, jawne dane (nazwy, nie żadne UUID/wewnętrzne pola). */
export class PartnerInviteInfoEntity {
  @ApiProperty() companyName!: string;
  @ApiProperty() distributorName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: [String] }) brandNames!: string[];
}
