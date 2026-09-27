import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LoginMethod } from '@prisma/client';

/** Kształt zwracany przez API — NIGDY `passwordHash`/`pinHash` (DATABASE.md zasada #3). */
export class UserEntity {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiPropertyOptional({ nullable: true }) shopId!: string | null;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) login!: string | null;
  @ApiProperty({
    enum: LoginMethod,
    description:
      'Password (domyślny) albo Pin — patrz komentarz przy User.loginMethod w schema.prisma.',
  })
  loginMethod!: LoginMethod;
  @ApiProperty() active!: boolean;
  @ApiPropertyOptional({ nullable: true }) lastLoginAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: [String], description: 'Kody ról (Role.code).' })
  roles!: string[];
}
