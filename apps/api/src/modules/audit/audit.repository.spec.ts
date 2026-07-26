import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from './audit.repository';

describe('AuditRepository', () => {
  let prisma: { auditLog: { create: jest.Mock; findMany: jest.Mock } };
  let repository: AuditRepository;

  beforeEach(() => {
    prisma = { auditLog: { create: jest.fn(), findMany: jest.fn() } };
    repository = new AuditRepository(prisma as unknown as PrismaService);
  });

  it('create() bez podanego klienta zapisuje przez this.prisma (kompatybilność wsteczna dla Companies/Customers/Products/Orders/Cases)', async () => {
    prisma.auditLog.create.mockResolvedValue({});
    await repository.create({ action: 'TEST_ACTION', entityType: 'Test', entityId: 'id-1' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: { action: 'TEST_ACTION', entityType: 'Test', entityId: 'id-1' } });
  });

  it('create() z podanym klientem transakcji (`tx`) zapisuje przez TEN klient, nie this.prisma — atomowość z mutacją domenową', async () => {
    const tx = { auditLog: { create: jest.fn().mockResolvedValue({}) } };
    await repository.create({ action: 'TEST_ACTION', entityType: 'Test', entityId: 'id-1' }, tx as never);
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: { action: 'TEST_ACTION', entityType: 'Test', entityId: 'id-1' } });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('findAllForCompany() filtruje po companyId i limituje do 200 wpisów', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    await repository.findAllForCompany('company-1');
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({ where: { companyId: 'company-1' }, orderBy: { createdAt: 'desc' }, take: 200 });
  });
});
