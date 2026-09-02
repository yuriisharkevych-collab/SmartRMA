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
      | 'findById'
      | 'findByIdUnscoped'
      | 'update'
      | 'countProductsAndBrands'
      | 'deleteRelationsForHardDelete'
      | 'hardDelete'
    >
  >;
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let storageService: { save: jest.Mock; read: jest.Mock; copy: jest.Mock };
  let service: ManufacturersService;

  beforeEach(() => {
    prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(TX_MARKER)) };
    repository = {
      findById: jest.fn(),
      findByIdUnscoped: jest.fn(),
      update: jest.fn(),
      countProductsAndBrands: jest.fn(),
      deleteRelationsForHardDelete: jest.fn(),
      hardDelete: jest.fn(),
    };
    auditRepository = { create: jest.fn() };
    storageService = { save: jest.fn(), read: jest.fn(), copy: jest.fn() };
    service = new ManufacturersService(
      prisma as unknown as PrismaService,
      repository as unknown as ManufacturersRepository,
      auditRepository as unknown as AuditRepository,
      storageService as never,
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

  describe('uploadLogo / getLogoBuffer (Etap 6)', () => {
    const file = {
      originalname: 'logo.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('x'),
    } as Express.Multer.File;

    it('uploadLogo() sprawdza IDOR przez findById(id, companyId) PRZED zapisem na dysk', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        service.uploadLogo('manufacturer-1', 'company-1', file, 'user-1'),
      ).rejects.toThrow();
      expect(storageService.save).not.toHaveBeenCalled();
    });

    it('uploadLogo() zapisuje plik pod dyskryminatorem obejmującym id producenta i aktualizuje publicFormLogoPath', async () => {
      repository.findById.mockResolvedValue(buildManufacturer() as never);
      storageService.save.mockResolvedValue({
        storagePath: 'company-1/manufacturer-manufacturer-1-logo/uuid.png',
        fileName: 'logo.png',
        mimeType: 'image/png',
        fileSize: 1024,
      });
      repository.update.mockResolvedValue(buildManufacturer() as never);

      await service.uploadLogo('manufacturer-1', 'company-1', file, 'user-1');

      expect(storageService.save).toHaveBeenCalledWith(
        'company-1',
        'manufacturer-manufacturer-1-logo',
        file,
      );
      expect(repository.update).toHaveBeenCalledWith('manufacturer-1', {
        publicFormLogoPath: 'company-1/manufacturer-manufacturer-1-logo/uuid.png',
      });
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MANUFACTURER_LOGO_UPDATED',
          entityId: 'manufacturer-1',
        }),
      );
    });

    it('getLogoBuffer() czyta BEZ companyId (publiczny endpoint) — rzuca NotFoundException, gdy producent nie ma jeszcze logo', async () => {
      repository.findByIdUnscoped.mockResolvedValue(buildManufacturer() as never);
      await expect(service.getLogoBuffer('manufacturer-1')).rejects.toThrow();
      expect(storageService.read).not.toHaveBeenCalled();
    });

    it('getLogoBuffer() zwraca bufor, gdy publicFormLogoPath jest ustawiony', async () => {
      repository.findByIdUnscoped.mockResolvedValue(
        buildManufacturer({
          publicFormLogoPath: 'company-1/manufacturer-manufacturer-1-logo/uuid.png',
        }) as never,
      );
      storageService.read.mockResolvedValue(Buffer.from('dane-obrazu'));

      const result = await service.getLogoBuffer('manufacturer-1');

      expect(storageService.read).toHaveBeenCalledWith(
        'company-1/manufacturer-manufacturer-1-logo/uuid.png',
      );
      expect(result.buffer.toString()).toBe('dane-obrazu');
    });
  });
});
