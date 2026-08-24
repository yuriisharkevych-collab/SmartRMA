import { NotFoundException } from '@nestjs/common';
import { OrganizationType, PartnershipStatus } from '@prisma/client';
import { AuditRepository } from '../audit/audit.repository';
import { PartnershipsRepository } from './partnerships.repository';
import { PartnershipsService } from './partnerships.service';

function buildPartnership(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'partnership-1',
    shopCompanyId: 'shop-1',
    shopCompany: { id: 'shop-1', name: 'DAWIDAM' },
    distributorCompanyId: 'distributor-1',
    distributorCompany: { id: 'distributor-1', name: 'TekstylPro' },
    status: PartnershipStatus.Invited,
    invitedByUserId: 'user-1',
    invitedAt: new Date('2026-01-01'),
    acceptedAt: null,
    deactivatedAt: null,
    brands: [
      {
        id: 'pb-1',
        partnershipId: 'partnership-1',
        brandId: 'brand-1',
        brand: { id: 'brand-1', name: 'TekstylPro Home' },
      },
    ],
    ...overrides,
  };
}

function buildDistributorCompany(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'distributor-1', type: OrganizationType.ManufacturerDistributor, ...overrides };
}

describe('PartnershipsService', () => {
  let repository: jest.Mocked<
    Pick<
      PartnershipsRepository,
      | 'findAllForCompany'
      | 'findById'
      | 'findByCompanyPair'
      | 'findCompanyBySlug'
      | 'findBrandsOwnedByCompany'
      | 'create'
      | 'updateStatus'
    >
  >;
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let service: PartnershipsService;

  beforeEach(() => {
    repository = {
      findAllForCompany: jest.fn(),
      findById: jest.fn(),
      findByCompanyPair: jest.fn(),
      findCompanyBySlug: jest.fn(),
      findBrandsOwnedByCompany: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn(),
    };
    auditRepository = { create: jest.fn() };
    service = new PartnershipsService(
      repository as unknown as PartnershipsRepository,
      auditRepository as unknown as AuditRepository,
    );
  });

  describe('invite', () => {
    const dto = { distributorSlug: 'tekstylpro', brandIds: ['brand-1'] };

    it('PARTNERSHIP-001 — rzuca, gdy organizacja o danym slugu nie istnieje', async () => {
      repository.findCompanyBySlug.mockResolvedValue(null);
      await expect(service.invite('shop-1', 'user-1', dto)).rejects.toMatchObject({
        code: 'PARTNERSHIP-001',
      });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('PARTNERSHIP-001 — rzuca, gdy organizacja o danym slugu jest Sklepem, nie Producentem/Dystrybutorem', async () => {
      repository.findCompanyBySlug.mockResolvedValue(
        buildDistributorCompany({ type: OrganizationType.Shop }) as never,
      );
      await expect(service.invite('shop-1', 'user-1', dto)).rejects.toMatchObject({
        code: 'PARTNERSHIP-001',
      });
    });

    it('PARTNERSHIP-002 — rzuca, gdy partnerstwo z tą organizacją już istnieje', async () => {
      repository.findCompanyBySlug.mockResolvedValue(buildDistributorCompany() as never);
      repository.findByCompanyPair.mockResolvedValue(buildPartnership() as never);
      await expect(service.invite('shop-1', 'user-1', dto)).rejects.toMatchObject({
        code: 'PARTNERSHIP-002',
      });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('PARTNERSHIP-004 — rzuca, gdy wskazana marka nie należy do zapraszanej organizacji', async () => {
      repository.findCompanyBySlug.mockResolvedValue(buildDistributorCompany() as never);
      repository.findByCompanyPair.mockResolvedValue(null);
      repository.findBrandsOwnedByCompany.mockResolvedValue([]);
      await expect(service.invite('shop-1', 'user-1', dto)).rejects.toMatchObject({
        code: 'PARTNERSHIP-004',
      });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('tworzy Partnership + PartnershipBrand i zapisuje AuditLog, gdy walidacja przechodzi', async () => {
      repository.findCompanyBySlug.mockResolvedValue(buildDistributorCompany() as never);
      repository.findByCompanyPair.mockResolvedValue(null);
      repository.findBrandsOwnedByCompany.mockResolvedValue([{ id: 'brand-1' }] as never);
      repository.create.mockResolvedValue(buildPartnership() as never);

      const result = await service.invite('shop-1', 'user-1', dto);

      expect(repository.create).toHaveBeenCalledWith('shop-1', 'distributor-1', 'user-1', [
        'brand-1',
      ]);
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'shop-1',
          userId: 'user-1',
          action: 'PARTNERSHIP_INVITED',
          entityType: 'Partnership',
        }),
      );
      expect(result.distributorCompanyName).toBe('TekstylPro');
    });
  });

  describe('accept / reject', () => {
    it('rzuca NotFoundException, gdy firma nie jest stroną partnerstwa (IDOR-safe findById)', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.accept('partnership-1', 'outsider', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('PARTNERSHIP-003 — Sklep (strona partnerstwa) nie może zaakceptować własnego zaproszenia', async () => {
      repository.findById.mockResolvedValue(buildPartnership() as never);
      await expect(service.accept('partnership-1', 'shop-1', 'user-1')).rejects.toMatchObject({
        code: 'PARTNERSHIP-003',
      });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('Dystrybutor akceptuje zaproszenie — status Active, acceptedAt ustawione, AuditLog zapisany', async () => {
      repository.findById.mockResolvedValue(buildPartnership() as never);
      repository.updateStatus.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Active, acceptedAt: new Date() }) as never,
      );

      await service.accept('partnership-1', 'distributor-1', 'user-2');

      expect(repository.updateStatus).toHaveBeenCalledWith(
        'partnership-1',
        expect.objectContaining({ status: PartnershipStatus.Active }),
      );
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'distributor-1', action: 'PARTNERSHIP_ACCEPTED' }),
      );
    });

    it('PARTNERSHIP-003 — Sklep nie może odrzucić własnego zaproszenia', async () => {
      repository.findById.mockResolvedValue(buildPartnership() as never);
      await expect(service.reject('partnership-1', 'shop-1', 'user-1')).rejects.toMatchObject({
        code: 'PARTNERSHIP-003',
      });
    });
  });

  describe('deactivate', () => {
    it('dozwolone z obu stron — Sklep może zakończyć aktywną współpracę', async () => {
      repository.findById.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Active }) as never,
      );
      repository.updateStatus.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Inactive }) as never,
      );

      await service.deactivate('partnership-1', 'shop-1', 'user-1');

      expect(repository.updateStatus).toHaveBeenCalledWith(
        'partnership-1',
        expect.objectContaining({ status: PartnershipStatus.Inactive }),
      );
    });

    it('dozwolone z obu stron — Dystrybutor może zakończyć aktywną współpracę', async () => {
      repository.findById.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Active }) as never,
      );
      repository.updateStatus.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Inactive }) as never,
      );

      await service.deactivate('partnership-1', 'distributor-1', 'user-2');

      expect(repository.updateStatus).toHaveBeenCalled();
    });
  });

  describe('findAllForCompany / findById', () => {
    it('mapuje listę partnerstw firmy na encje', async () => {
      repository.findAllForCompany.mockResolvedValue([buildPartnership()] as never);
      const result = await service.findAllForCompany('shop-1');
      expect(result).toHaveLength(1);
      expect(result[0].shopCompanyName).toBe('DAWIDAM');
    });

    it('rzuca NotFoundException, gdy sprawa nie istnieje/nie jest widoczna dla firmy', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.findById('partnership-1', 'outsider')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
