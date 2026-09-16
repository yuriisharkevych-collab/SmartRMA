import { ApiProperty } from '@nestjs/swagger';

/** `GET /platform-admin/me` — pola świadomie ograniczone (`id`/`email`/`lastLoginAt`), bez `passwordHash`. */
export class PlatformAdminProfileEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  lastLoginAt!: string | null;
}
