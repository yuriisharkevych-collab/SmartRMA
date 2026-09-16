import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformAdminRepository } from './platform-admin.repository';
import { PlatformAdminProfileEntity } from './entities/platform-admin-profile.entity';
import { PlatformCompanySummaryEntity } from './entities/platform-company-summary.entity';

/**
 * `GET /platform-admin/*` — WYŁĄCZNIE odczyty, WYŁĄCZNIE pola z
 * `PlatformCompanySummaryEntity`/`PlatformAdminProfileEntity` (patrz ich
 * doc-comment) — brak jakiegokolwiek endpointu mutującego dane tenanta z
 * poziomu Platform Admin w tej fazie (wprost z zadania: "Nie dawaj
 * automatycznie Platform Adminowi pełnego dostępu do danych wszystkich
 * tenantów bez jawnego mechanizmu/autoryzacji").
 */
@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getProfile(platformAdminId: string): Promise<PlatformAdminProfileEntity> {
    const admin = await this.platformAdminRepository.findById(platformAdminId);
    if (!admin) throw new NotFoundException();
    return {
      id: admin.id,
      email: admin.email,
      lastLoginAt: admin.lastLoginAt ? admin.lastLoginAt.toISOString() : null,
    };
  }

  async listCompanies(): Promise<PlatformCompanySummaryEntity[]> {
    const companies = await this.prisma.company.findMany({
      select: { id: true, name: true, type: true, orgKind: true, active: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return companies.map((company) => ({
      id: company.id,
      name: company.name,
      type: company.type,
      orgKind: company.orgKind,
      active: company.active,
      createdAt: company.createdAt.toISOString(),
    }));
  }
}
