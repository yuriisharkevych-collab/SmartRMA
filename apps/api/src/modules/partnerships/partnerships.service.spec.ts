import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrganizationType, PartnershipStatus } from '@prisma/client';
import { AuditRepository } from '../audit/audit.repository';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from '../auth/services/password.service';
import { CaseStatusesService } from '../case-statuses/case-statuses.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersRepository } from '../users/users.repository';
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
  return {
    id: 'distributor-1',
    type: OrganizationType.ManufacturerDistributor,
    active: true,
    ...overrides,
  };
}

function buildShopCompany(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'shop-1', type: OrganizationType.Shop, active: true, ...overrides };
}

describe('PartnershipsService', () => {
  let repository: jest.Mocked<
    Pick<
      PartnershipsRepository,
      | 'findAllForCompany'
      | 'findById'
      | 'findByCompanyPair'
      | 'findCompanyBySlug'
      | 'findCompanyByNip'
      | 'findCompanyById'
      | 'findBrandsOwnedByCompany'
      | 'create'
      | 'createConnectionRequest'
      | 'resetRejectedToInvited'
      | 'updateStatus'
      | 'countCasesForPartnership'
      | 'findPendingOrActiveInviteByEmail'
      | 'createPendingPartnerCompany'
      | 'createWithInviteToken'
      | 'findByInviteTokenHash'
      | 'activateFromInvite'
      | 'createAdminUser'
    >
  >;
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let caseStatusesService: jest.Mocked<Pick<CaseStatusesService, 'seedDefaultCatalog'>>;
  let passwordService: jest.Mocked<Pick<PasswordService, 'hash'>>;
  let usersRepository: jest.Mocked<Pick<UsersRepository, 'findPasswordAccountByEmail'>>;
  let authService: jest.Mocked<Pick<AuthService, 'login'>>;
  let notificationsService: jest.Mocked<
    Pick<NotificationsService, 'createNotificationFromTemplate'>
  >;
  let config: jest.Mocked<Pick<ConfigService, 'get'>>;
  let service: PartnershipsService;

  beforeEach(() => {
    repository = {
      findAllForCompany: jest.fn(),
      findById: jest.fn(),
      findByCompanyPair: jest.fn(),
      findCompanyBySlug: jest.fn(),
      findCompanyByNip: jest.fn(),
      findCompanyById: jest.fn(),
      findBrandsOwnedByCompany: jest.fn(),
      create: jest.fn(),
      createConnectionRequest: jest.fn(),
      resetRejectedToInvited: jest.fn(),
      updateStatus: jest.fn(),
      countCasesForPartnership: jest.fn().mockResolvedValue(0),
      findPendingOrActiveInviteByEmail: jest.fn(),
      createPendingPartnerCompany: jest.fn(),
      createWithInviteToken: jest.fn(),
      findByInviteTokenHash: jest.fn(),
      activateFromInvite: jest.fn(),
      createAdminUser: jest.fn(),
    };
    auditRepository = { create: jest.fn() };
    caseStatusesService = { seedDefaultCatalog: jest.fn() };
    passwordService = { hash: jest.fn().mockResolvedValue('hashed') };
    usersRepository = { findPasswordAccountByEmail: jest.fn() };
    authService = { login: jest.fn() };
    notificationsService = { createNotificationFromTemplate: jest.fn() };
    config = { get: jest.fn().mockReturnValue(['http://localhost:5173']) };
    service = new PartnershipsService(
      repository as unknown as PartnershipsRepository,
      auditRepository as unknown as AuditRepository,
      caseStatusesService as unknown as CaseStatusesService,
      passwordService as unknown as PasswordService,
      usersRepository as unknown as UsersRepository,
      authService as unknown as AuthService,
      notificationsService as unknown as NotificationsService,
      config as unknown as ConfigService,
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

    it('dolicza caseCount z countCasesForPartnership', async () => {
      repository.findById.mockResolvedValue(buildPartnership() as never);
      repository.countCasesForPartnership.mockResolvedValue(7);
      const result = await service.findById('partnership-1', 'shop-1');
      expect(result.caseCount).toBe(7);
    });
  });

  describe('invitePartner (Etap 5/6 — wołający zaprasza NOWEGO partnera e-mailem, symetryczne)', () => {
    const dto = {
      companyName: 'Nowy Partner',
      adminEmail: 'admin@nowy-partner.pl',
      nip: '1234567890',
    };

    it('PARTNERSHIP-008 — rzuca, gdy ten e-mail ma już oczekujące/aktywne zaproszenie u wołającego', async () => {
      repository.findPendingOrActiveInviteByEmail.mockResolvedValue(buildPartnership() as never);
      await expect(service.invitePartner('distributor-1', 'user-1', dto)).rejects.toMatchObject({
        code: 'PARTNERSHIP-008',
      });
      expect(repository.createPendingPartnerCompany).not.toHaveBeenCalled();
    });

    it('Dystrybutor zaprasza NOWEGO Sklepu — nowa firma dostaje type=Shop, wołający zostaje distributorCompanyId', async () => {
      repository.findPendingOrActiveInviteByEmail.mockResolvedValue(null);
      repository.findCompanyById.mockResolvedValue(buildDistributorCompany() as never);
      repository.createPendingPartnerCompany.mockResolvedValue({
        id: 'new-shop-1',
        name: 'Nowy Partner',
      } as never);
      repository.createWithInviteToken.mockResolvedValue(buildPartnership() as never);

      const result = await service.invitePartner('distributor-1', 'user-1', dto);

      expect(repository.createPendingPartnerCompany).toHaveBeenCalledWith(
        'Nowy Partner',
        '1234567890',
        'Shop',
      );
      expect(caseStatusesService.seedDefaultCatalog).toHaveBeenCalledWith('new-shop-1');
      expect(repository.createWithInviteToken).toHaveBeenCalledWith(
        'new-shop-1',
        'distributor-1',
        'user-1',
        'admin@nowy-partner.pl',
        expect.any(String),
        expect.any(Date),
      );
      expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'partnership.invited.partner',
          recipientEmail: 'admin@nowy-partner.pl',
        }),
      );
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PARTNERSHIP_PARTNER_INVITED' }),
      );
      expect(result.distributorCompanyName).toBe('TekstylPro');
    });

    it('Etap 6 — Sklep zaprasza NOWEGO Dystrybutora — nowa firma dostaje type=ManufacturerDistributor, wołający zostaje shopCompanyId', async () => {
      repository.findPendingOrActiveInviteByEmail.mockResolvedValue(null);
      repository.findCompanyById.mockResolvedValue(buildShopCompany() as never);
      repository.createPendingPartnerCompany.mockResolvedValue({
        id: 'new-distributor-1',
        name: 'Nowy Partner',
      } as never);
      repository.createWithInviteToken.mockResolvedValue(buildPartnership() as never);

      await service.invitePartner('shop-1', 'user-1', dto);

      expect(repository.createPendingPartnerCompany).toHaveBeenCalledWith(
        'Nowy Partner',
        '1234567890',
        'ManufacturerDistributor',
      );
      expect(repository.createWithInviteToken).toHaveBeenCalledWith(
        'shop-1',
        'new-distributor-1',
        'user-1',
        'admin@nowy-partner.pl',
        expect.any(String),
        expect.any(Date),
      );
    });
  });

  describe('searchCompanyByNip (Etap 6)', () => {
    it('zwraca null, gdy nie znaleziono żadnej firmy o tym NIP', async () => {
      repository.findCompanyByNip.mockResolvedValue(null);
      const result = await service.searchCompanyByNip('shop-1', { nip: '1234567890' });
      expect(result).toBeNull();
      expect(repository.findCompanyById).not.toHaveBeenCalled();
    });

    it('zwraca null, gdy trafiono we WŁASNĄ firmę wołającego', async () => {
      repository.findCompanyByNip.mockResolvedValue(buildShopCompany({ id: 'shop-1' }) as never);
      const result = await service.searchCompanyByNip('shop-1', { nip: '1234567890' });
      expect(result).toBeNull();
    });

    it('bezpieczeństwo tenantów — zwraca WYŁĄCZNIE id/name/nip/type/alreadyConnected/pendingRequest, zero danych wewnętrznych', async () => {
      repository.findCompanyByNip.mockResolvedValue(
        buildDistributorCompany({ name: 'TekstylPro', nip: '9998887776' }) as never,
      );
      repository.findCompanyById.mockResolvedValue(buildShopCompany() as never);
      repository.findByCompanyPair.mockResolvedValue(null);

      const result = await service.searchCompanyByNip('shop-1', { nip: '9998887776' });

      expect(result).toEqual({
        id: 'distributor-1',
        name: 'TekstylPro',
        nip: '9998887776',
        type: 'ManufacturerDistributor',
        alreadyConnected: false,
        pendingRequest: false,
      });
    });

    it('alreadyConnected=true, gdy partnerstwo tej pary firm jest już Active', async () => {
      repository.findCompanyByNip.mockResolvedValue(buildDistributorCompany() as never);
      repository.findCompanyById.mockResolvedValue(buildShopCompany() as never);
      repository.findByCompanyPair.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Active }) as never,
      );

      const result = await service.searchCompanyByNip('shop-1', { nip: '1234567890' });
      expect(result?.alreadyConnected).toBe(true);
      expect(result?.pendingRequest).toBe(false);
    });

    it('pendingRequest=true, gdy partnerstwo tej pary firm jest Invited', async () => {
      repository.findCompanyByNip.mockResolvedValue(buildDistributorCompany() as never);
      repository.findCompanyById.mockResolvedValue(buildShopCompany() as never);
      repository.findByCompanyPair.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Invited }) as never,
      );

      const result = await service.searchCompanyByNip('shop-1', { nip: '1234567890' });
      expect(result?.pendingRequest).toBe(true);
      expect(result?.alreadyConnected).toBe(false);
    });

    it('para typów niezgodna (oba Shop) — zwraca znalezioną firmę, ale obie flagi false (nigdy nie mogłoby powstać partnerstwo)', async () => {
      repository.findCompanyByNip.mockResolvedValue(buildShopCompany({ id: 'shop-2' }) as never);
      repository.findCompanyById.mockResolvedValue(buildShopCompany({ id: 'shop-1' }) as never);

      const result = await service.searchCompanyByNip('shop-1', { nip: '1234567890' });
      expect(result?.alreadyConnected).toBe(false);
      expect(result?.pendingRequest).toBe(false);
      expect(repository.findByCompanyPair).not.toHaveBeenCalled();
    });
  });

  describe('requestConnection (Etap 6)', () => {
    it('PARTNERSHIP-010 — rzuca, gdy targetCompanyId === callerCompanyId', async () => {
      await expect(
        service.requestConnection('shop-1', 'user-1', { targetCompanyId: 'shop-1' }),
      ).rejects.toMatchObject({ code: 'PARTNERSHIP-010' });
    });

    it('rzuca NotFoundException, gdy cel nie istnieje', async () => {
      repository.findCompanyById.mockImplementation((id: string) =>
        Promise.resolve(id === 'shop-1' ? (buildShopCompany() as never) : null),
      );
      await expect(
        service.requestConnection('shop-1', 'user-1', { targetCompanyId: 'missing' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rzuca NotFoundException, gdy cel istnieje, ale jest nieaktywny', async () => {
      repository.findCompanyById.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'shop-1'
            ? (buildShopCompany() as never)
            : (buildDistributorCompany({ active: false }) as never),
        ),
      );
      await expect(
        service.requestConnection('shop-1', 'user-1', { targetCompanyId: 'distributor-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('PARTNERSHIP-001 — rzuca, gdy obie firmy są tego samego typu (Shop+Shop)', async () => {
      repository.findCompanyById.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'shop-1'
            ? (buildShopCompany() as never)
            : (buildShopCompany({ id: 'shop-2', active: true }) as never),
        ),
      );
      await expect(
        service.requestConnection('shop-1', 'user-1', { targetCompanyId: 'shop-2' }),
      ).rejects.toMatchObject({ code: 'PARTNERSHIP-001' });
    });

    it('PARTNERSHIP-002 — rzuca, gdy partnerstwo tej pary jest już Active', async () => {
      repository.findCompanyById.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'shop-1' ? (buildShopCompany() as never) : (buildDistributorCompany() as never),
        ),
      );
      repository.findByCompanyPair.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Active }) as never,
      );
      await expect(
        service.requestConnection('shop-1', 'user-1', { targetCompanyId: 'distributor-1' }),
      ).rejects.toMatchObject({ code: 'PARTNERSHIP-002' });
      expect(repository.createConnectionRequest).not.toHaveBeenCalled();
    });

    it('PARTNERSHIP-009 — rzuca, gdy prośba do tej firmy już oczekuje (Invited)', async () => {
      repository.findCompanyById.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'shop-1' ? (buildShopCompany() as never) : (buildDistributorCompany() as never),
        ),
      );
      repository.findByCompanyPair.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Invited }) as never,
      );
      await expect(
        service.requestConnection('shop-1', 'user-1', { targetCompanyId: 'distributor-1' }),
      ).rejects.toMatchObject({ code: 'PARTNERSHIP-009' });
      expect(repository.createConnectionRequest).not.toHaveBeenCalled();
      expect(repository.resetRejectedToInvited).not.toHaveBeenCalled();
    });

    it('brak wcześniejszego partnerstwa — tworzy NOWĄ prośbę (createConnectionRequest), audytuje i powiadamia', async () => {
      repository.findCompanyById.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'shop-1'
            ? (buildShopCompany() as never)
            : (buildDistributorCompany({ email: 'kontakt@tekstylpro.pl' }) as never),
        ),
      );
      repository.findByCompanyPair.mockResolvedValue(null);
      repository.createConnectionRequest.mockResolvedValue(buildPartnership() as never);

      const result = await service.requestConnection('shop-1', 'user-1', {
        targetCompanyId: 'distributor-1',
      });

      expect(repository.createConnectionRequest).toHaveBeenCalledWith(
        'shop-1',
        'distributor-1',
        'user-1',
      );
      expect(repository.resetRejectedToInvited).not.toHaveBeenCalled();
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PARTNERSHIP_CONNECTION_REQUESTED' }),
      );
      expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'partnership.connection.requested',
          recipientEmail: 'kontakt@tekstylpro.pl',
        }),
      );
      expect(result.id).toBe('partnership-1');
    });

    it('Rejected → Invited (decyzja właściciela, punkt 2) — resetuje ISTNIEJĄCY wiersz, NIE tworzy drugiego Partnership', async () => {
      repository.findCompanyById.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'shop-1' ? (buildShopCompany() as never) : (buildDistributorCompany() as never),
        ),
      );
      repository.findByCompanyPair.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Rejected }) as never,
      );
      repository.resetRejectedToInvited.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Invited }) as never,
      );

      await service.requestConnection('shop-1', 'user-1', { targetCompanyId: 'distributor-1' });

      expect(repository.resetRejectedToInvited).toHaveBeenCalledWith('partnership-1', 'user-1');
      expect(repository.createConnectionRequest).not.toHaveBeenCalled();
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PARTNERSHIP_CONNECTION_REQUESTED_AGAIN' }),
      );
    });
  });

  describe('getInviteInfo / acceptPartnerInvite', () => {
    function buildInvitedPartnership(overrides: Partial<Record<string, unknown>> = {}) {
      return buildPartnership({
        status: PartnershipStatus.Invited,
        inviteEmail: 'admin@nowy-partner.pl',
        inviteTokenHash: 'hashed-token',
        inviteTokenExpiresAt: new Date(Date.now() + 60_000),
        ...overrides,
      });
    }

    it('PARTNERSHIP-007 — rzuca, gdy token nie istnieje', async () => {
      repository.findByInviteTokenHash.mockResolvedValue(null);
      await expect(service.getInviteInfo('bad-token')).rejects.toMatchObject({
        code: 'PARTNERSHIP-007',
      });
    });

    it('PARTNERSHIP-007 — rzuca, gdy token wygasł', async () => {
      repository.findByInviteTokenHash.mockResolvedValue(
        buildInvitedPartnership({ inviteTokenExpiresAt: new Date(Date.now() - 1000) }) as never,
      );
      await expect(service.getInviteInfo('expired-token')).rejects.toMatchObject({
        code: 'PARTNERSHIP-007',
      });
    });

    it('PARTNERSHIP-007 — rzuca, gdy partnerstwo nie jest już w stanie Invited (token zużyty)', async () => {
      repository.findByInviteTokenHash.mockResolvedValue(
        buildInvitedPartnership({ status: PartnershipStatus.Active }) as never,
      );
      await expect(service.getInviteInfo('used-token')).rejects.toMatchObject({
        code: 'PARTNERSHIP-007',
      });
    });

    it('getInviteInfo zwraca nazwy firm/marek dla poprawnego tokenu', async () => {
      repository.findByInviteTokenHash.mockResolvedValue(buildInvitedPartnership() as never);
      const info = await service.getInviteInfo('good-token');
      expect(info).toEqual({
        companyName: 'DAWIDAM',
        distributorName: 'TekstylPro',
        email: 'admin@nowy-partner.pl',
        brandNames: ['TekstylPro Home'],
      });
    });

    it('acceptPartnerInvite zakłada Administratora, aktywuje partnerstwo i loguje (auto-login)', async () => {
      repository.findByInviteTokenHash.mockResolvedValue(buildInvitedPartnership() as never);
      usersRepository.findPasswordAccountByEmail.mockResolvedValue({ id: 'new-user-1' } as never);
      authService.login.mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'b',
        expiresIn: 900,
      } as never);

      const result = await service.acceptPartnerInvite('good-token', {
        firstName: 'Jan',
        lastName: 'Kowalski',
        password: 'Test-Password-123!',
      });

      expect(passwordService.hash).toHaveBeenCalledWith('Test-Password-123!');
      expect(repository.createAdminUser).toHaveBeenCalledWith(
        'shop-1',
        'Jan',
        'Kowalski',
        'admin@nowy-partner.pl',
        'hashed',
      );
      expect(repository.activateFromInvite).toHaveBeenCalledWith('partnership-1');
      expect(authService.login).toHaveBeenCalledWith({ id: 'new-user-1' });
      expect(result.accessToken).toBe('a');
    });
  });

  describe('assertActivePartnerCoversBrand / findAllowedBrandIdsForPartner (Etap 5 — egzekwowanie PartnershipBrand na formularzu publicznym)', () => {
    it('findAllowedBrandIdsForPartner zwraca [] gdy brak aktywnego partnerstwa', async () => {
      repository.findByCompanyPair.mockResolvedValue(null);
      const result = await service.findAllowedBrandIdsForPartner('distributor-1', 'shop-1');
      expect(result).toEqual([]);
    });

    it('findAllowedBrandIdsForPartner zwraca listę brandId objętych PartnershipBrand', async () => {
      repository.findByCompanyPair.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Active }) as never,
      );
      repository.findById.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Active }) as never,
      );
      const result = await service.findAllowedBrandIdsForPartner('distributor-1', 'shop-1');
      expect(result).toEqual(['brand-1']);
    });

    it('assertActivePartnerCoversBrand PARTNERSHIP-005 — rzuca, gdy marka NIE jest objęta partnerstwem tego partnera', async () => {
      repository.findByCompanyPair.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Active }) as never,
      );
      repository.findById.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Active }) as never,
      );
      await expect(
        service.assertActivePartnerCoversBrand('distributor-1', 'shop-1', 'inna-marka'),
      ).rejects.toMatchObject({ code: 'PARTNERSHIP-005' });
    });

    it('assertActivePartnerCoversBrand przechodzi bez błędu, gdy marka JEST objęta partnerstwem', async () => {
      repository.findByCompanyPair.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Active }) as never,
      );
      repository.findById.mockResolvedValue(
        buildPartnership({ status: PartnershipStatus.Active }) as never,
      );
      await expect(
        service.assertActivePartnerCoversBrand('distributor-1', 'shop-1', 'brand-1'),
      ).resolves.toBeUndefined();
    });
  });
});
