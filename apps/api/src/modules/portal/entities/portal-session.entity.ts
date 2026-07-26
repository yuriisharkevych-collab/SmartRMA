import { ApiProperty } from '@nestjs/swagger';

export class PortalSessionEntity {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ description: 'Sekundy do wygaśnięcia sesji (JWT_PORTAL_EXPIRES_IN).' }) expiresIn!: number;
}
