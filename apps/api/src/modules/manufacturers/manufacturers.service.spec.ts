import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';
import { ManufacturersRepository } from './manufacturers.repository';
import { ManufacturersService } from './manufacturers.service';

const TX_MARKER = { __tx: true } as const;

function buildManufacturer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'manufacturer-1',
    contractorId: 'contractor-1',
    companyId: 'company-1',
    sla: null,
    logistics: null,
    automation: null,
    ...overrides,
  };
}

describe('ManufacturersService', () => {
  let prisma: { $transaction: jest.Mock };
  let repository: jest.Mocked<
    Pick<
      ManufacturersRepository,
      'findById' | 'countProductsAndBrands' | 'deleteRelationsForHardDelete' | 'hardDelete'
    >
  >;
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let service: ManufacturersService;

  beforeEach(() => {
    prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(TX_MARKER)) };
    repository = {
      findById: jest.fn(),
      countProductsAndBrands: jest.fn(),
      deleteRelationsForHardDelete: jest.fn(),
      hardDelete: jest.fn(),
    };
    auditRepository = { create: jest.fn() };
    service = new ManufacturersService(
      prisma as unknown as PrismaService,
      repository as unknown as ManufacturersRepository,
      auditRepository as unknown as AuditRepository,
    );
  });

  describe('hardDelete', () => {
    it('rzuca NotFoundException, gdy producent nie istnieje dla tej firmy (IDOR-safe findById)', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.hardDelete('manufacturer-1', 'company-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('MANUFACTURER-003 — blokuje usunięcie, gdy producent ma przypisane produkty', async () => {
      repository.findById.mockResolvedValue(buildManufacturer() as never);
      repository.countProductsAndBrands.mockResolvedValue({ products: 2, brands: 0 });

      await expect(
        service.hardDelete('manufacturer-1', 'company-1', 'user-1'),
      ).rejects.toMatchObject({ code: 'MANUFACTURER-003' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('MANUFACTURER-003 — blokuje usunięcie, gdy producent ma przypisane marki', async () => {
      repository.findById.mockResolvedValue(buildManufacturer() as never);
      repository.countProductsAndBrands.mockResolvedValue({ products: 0, brands: 1 });

      await expect(
        service.hardDelete('manufacturer-1', 'company-1', 'user-1'),
      ).rejects.toMatchObject({ code: 'MANUFACTURER-003' });
    });

    it('bez produktów/marek — kasuje relacje 1:1, zapisuje AuditLog, kasuje Manufacturer, wszystko w jednej transakcji', async () => {
      repository.findById.mockResolvedValue(buildManufacturer() as never);
      repository.countProductsAndBrands.mockResolvedValue({ products: 0, brands: 0 });

      await service.hardDelete('manufacturer-1', 'company-1', 'user-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(repository.deleteRelationsForHardDelete).toHaveBeenCalledWith(
        'manufacturer-1',
        TX_MARKER,
      );
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          userId: 'user-1',
          action: 'MANUFACTURER_DELETED',
          entityType: 'Manufacturer',
          entityId: 'manufacturer-1',
        }),
        TX_MARKER,
      );
      expect(repository.hardDelete).toHaveBeenCalledWith('manufacturer-1', TX_MARKER);
    });
  });
});
