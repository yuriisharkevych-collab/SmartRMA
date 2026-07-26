import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** Ciało wspólne dla POST /auth/refresh i POST /auth/logout — oba operują na Refresh Tokenie (RefreshTokenGuard). */
export class RefreshTokenDto {
  @ApiProperty()
  @IsString({ message: 'VALIDATION-001' })
  @MinLength(1, { message: 'VALIDATION-001' })
  refreshToken!: string;
}
