import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Zadanie 9 (decyzja końcowa) — `@@unique([companyId, key])` zastąpione
 * `@@index` w schema.prisma (Postgres nie blokuje dwóch wpisów
 * `companyId=null` o tym samym `key` w zwykłym indeksie unikalnym; prawdziwa
 * unikalność wymaga ręcznie dopisanego ograniczenia w migracji — patrz
 * DATABASE.md §30). Konsekwencja tutaj: `upsert` nie może już użyć
 * wygenerowanego złożonego klucza `companyId_key` (Prisma go nie tworzy bez
 * `@@unique`) — `findFirst` + `update`/`create` poniżej to jedyny sposób.
 */
@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllVisibleToCompany(companyId: string) {
    return this.prisma.setting.findMany({ where: { OR: [{ companyId: null }, { companyId }] } });
  }

  async upsertForCompany(
    companyId: string,
    data: { key: string; value: Prisma.InputJsonValue; type?: Prisma.SettingUncheckedCreateInput['type']; description?: string },
  ) {
    const existing = await this.prisma.setting.findFirst({ where: { companyId, key: data.key } });
    if (existing) {
      return this.prisma.setting.update({ where: { id: existing.id }, data });
    }
    return this.prisma.setting.create({ data: { ...data, companyId } });
  }
}
