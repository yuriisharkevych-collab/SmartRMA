import { ApiProperty } from '@nestjs/swagger';

export class AuthTokensEntity {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ description: 'Sekundy do wygaśnięcia accessToken.' })
  expiresIn!: number;
}
