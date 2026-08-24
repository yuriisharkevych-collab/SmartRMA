import { PrismaService } from '../../prisma/prisma.service';
import { SystemStatsService } from './system-stats.service';

describe('SystemStatsService', () => {
  let prisma: {
    user: { count: jest.Mock };
    customer: { count: jest.Mock };
    case: { count: jest.Mock };
    manufacturer: { count: jest.Mock };
    product: { count: jest.Mock };
    document: { aggregate: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let service: SystemStatsService;

  beforeEach(() => {
    prisma = {
      user: { count: jest.fn().mockResolvedValue(2) },
      customer: { count: jest.fn().mockResolvedValue(10) },
      case: { count: jest.fn().mockResolvedValue(7) },
      manufacturer: { count: jest.fn().mockResolvedValue(1) },
      product: { count: jest.fn().mockResolvedValue(3) },
      document: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _count: { _all: 20 }, _sum: { fileSize: 123456 } }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ version: 'PostgreSQL 16.0' }]),
    };
    service = new SystemStatsService(prisma as unknown as PrismaService);
  });

  it('liczy wszystkie encje odfiltrowane po companyId danej firmy', async () => {
    const stats = await service.getStats('company-1');

    expect(prisma.user.count).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    expect(prisma.customer.count).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    expect(prisma.case.count).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    expect(prisma.manufacturer.count).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    expect(prisma.product.count).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    expect(stats).toMatchObject({
      userCount: 2,
      customerCount: 10,
      caseCount: 7,
      manufacturerCount: 1,
      productCount: 3,
    });
  });

  it('liczy dokumenty/rozmiar przez relację Document→Case (Document nie ma własnego companyId)', async () => {
    await service.getStats('company-1');
    expect(prisma.document.aggregate).toHaveBeenCalledWith({
      where: { case: { companyId: 'company-1' } },
      _count: { _all: true },
      _sum: { fileSize: true },
    });
  });

  it('zwraca 0, gdy firma nie ma jeszcze żadnych dokumentów (suma NULL z SQL)', async () => {
    prisma.document.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { fileSize: null } });
    const stats = await service.getStats('company-1');
    expect(stats.documentCount).toBe(0);
    expect(stats.storageUsedBytes).toBe(0);
  });

  it('czyta wersję bazy przez SELECT version() i wersję aplikacji z npm_package_version', async () => {
    const stats = await service.getStats('company-1');
    expect(stats.databaseVersion).toBe('PostgreSQL 16.0');
    expect(stats.appVersion).toBe(process.env.npm_package_version ?? '0.1.0');
  });
});
