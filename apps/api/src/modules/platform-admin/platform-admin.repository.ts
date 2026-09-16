import { Injectable } from '@nestjs/common';
import { PlatformAdmin } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Fundament „Fresh Install" — dostęp do danych `PlatformAdmin`, model BEZ
 * ŻADNEJ relacji do `Company`/`User` (patrz `schema.prisma`, doc-comment
 * modelu) — strukturalna, nie tylko logiczna, gwarancja że administrator
 * platformy nie "wchodzi" przypadkiem w dane tenanta przez Prisma include.
 */
@Injectable()
export class PlatformAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<PlatformAdmin | null> {
    return this.prisma.platformAdmin.findUnique({ where: { email } });
  }

  findById(id: string): Promise<PlatformAdmin | null> {
    return this.prisma.platformAdmin.findUnique({ where: { id } });
  }

  touchLastLogin(id: string): Promise<PlatformAdmin> {
    return this.prisma.platformAdmin.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }
}
