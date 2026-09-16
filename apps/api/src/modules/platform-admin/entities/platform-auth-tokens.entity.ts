import { ApiProperty } from '@nestjs/swagger';

/** Celowo TYLKO access token, bez refresh (zakres minimalny — patrz doc-comment `PlatformAuthService`). */
export class PlatformAuthTokensEntity {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ description: 'Sekundy do wygaśnięcia accessToken.' })
  expiresIn!: number;
}
