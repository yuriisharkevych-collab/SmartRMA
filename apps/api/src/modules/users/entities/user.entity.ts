import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Kształt zwracany przez API — NIGDY `passwordHash` (DATABASE.md zasada #3). */
export class UserEntity {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiPropertyOptional({ nullable: true }) shopId!: string | null;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() email!: string;
  @ApiProperty() active!: boolean;
  @ApiPropertyOptional({ nullable: true }) lastLoginAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: [String], description: 'Kody ról (Role.code).' })
  roles!: string[];
}
