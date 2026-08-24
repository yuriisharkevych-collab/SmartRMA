import { Brand, Product } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../audit/audit.repository';
import { ManufacturersService } from '../manufacturers/manufacturers.service';
import { IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    companyId: 'company-1',
    manufacturerId: 'manufacturer-1',
    brandId: null,
    name: 'Rower X',
    sku: 'SKU-1',
    category: 'Rowery',
    active: true,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  } as Product;
}

function buildBrand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: 'brand-1',
    companyId: 'company-1',
    manufacturerId: 'manufacturer-1',
    name: 'Acme',
    active: true,
    ...overrides,
  } as Brand;
}

describe('ProductsService', () => {
  let productsRepository: jest.Mocked<
    Pick<
      ProductsRepository,
      | 'findAllForCompany'
      | 'search'
      | 'findById'
      | 'create'
      | 'update'
      | 'findAllBrandsForCompany'
      | 'searchBrands'
      | 'findBrandById'
      | 'createBrand'
      | 'updateBrand'
    >
  >;
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let manufacturersService: jest.Mocked<Pick<ManufacturersService, 'findById'>>;
  let eventBus: jest.Mocked<IEventBus>;
  let service: ProductsService;

  beforeEach(() => {
    productsRepository = {
      findAllForCompany: jest.fn(),
      search: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findAllBrandsForCompany: jest.fn(),
      searchBrands: jest.fn(),
      findBrandById: jest.fn(),
      createBrand: jest.fn(),
      updateBrand: jest.fn(),
    };
    auditRepository = { create: jest.fn() };
    manufacturersService = { findById: jest.fn().mockResolvedValue({ id: 'manufacturer-1' }) };
    eventBus = { publish: jest.fn(), publishAll: jest.fn() };

    service = new ProductsService(
      productsRepository as unknown as ProductsRepository,
      auditRepository as unknown as AuditRepository,
      manufacturersService as unknown as ManufacturersService,
      eventBus,
    );
  });

  describe('findById', () => {
    it('rzuca NotFoundException, gdy produkt nie istnieje (brak kodu PRODUCT-* w ERROR_CODES.md)', async () => {
      productsRepository.findById.mockResolvedValue(null);
      await expect(service.findById('brak', 'company-1')).rejects.toThrow(NotFoundException);
    });

    it('zwraca ProductEntity, gdy produkt istnieje', async () => {
      productsRepository.findById.mockResolvedValue(buildProduct());
      const result = await service.findById('product-1', 'company-1');
      expect(result.id).toBe('product-1');
    });
  });

  describe('listProducts / searchProducts', () => {
    it('listProducts() deleguje do findAllForCompany()', async () => {
      productsRepository.findAllForCompany.mockResolvedValue([buildProduct()]);
      await service.listProducts('company-1');
      expect(productsRepository.findAllForCompany).toHaveBeenCalledWith('company-1');
    });

    it('searchProducts() deleguje do search() z frazą', async () => {
      productsRepository.search.mockResolvedValue([buildProduct()]);
      await service.searchProducts('company-1', 'rower');
      expect(productsRepository.search).toHaveBeenCalledWith('company-1', 'rower');
    });
  });

  describe('createProduct', () => {
    it('weryfikuje istnienie manufacturerId PRZED zapisem — 404, gdy producent nie istnieje', async () => {
      manufacturersService.findById.mockRejectedValue(new NotFoundException());
      await expect(
        service.createProduct('company-1', { manufacturerId: 'brak', name: 'X' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
      expect(productsRepository.create).not.toHaveBeenCalled();
    });

    it('weryfikuje istnienie brandId, gdy podane — 404, gdy marka nie istnieje', async () => {
      productsRepository.findBrandById.mockResolvedValue(null);
      await expect(
        service.createProduct(
          'company-1',
          { manufacturerId: 'manufacturer-1', name: 'X', brandId: 'brak' },
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(productsRepository.create).not.toHaveBeenCalled();
    });

    it('NIE wymusza spójności brandId/manufacturerId (BR-076 — marka sugeruje, nie wymusza)', async () => {
      productsRepository.findBrandById.mockResolvedValue(
        buildBrand({ manufacturerId: 'inny-producent' }),
      );
      productsRepository.create.mockResolvedValue(
        buildProduct({ brandId: 'brand-1', manufacturerId: 'manufacturer-1' }),
      );

      await expect(
        service.createProduct(
          'company-1',
          { manufacturerId: 'manufacturer-1', name: 'X', brandId: 'brand-1' },
          'user-1',
        ),
      ).resolves.toBeDefined();
    });

    it('zapisuje AuditLog i publikuje ProductCreated', async () => {
      const product = buildProduct();
      productsRepository.create.mockResolvedValue(product);

      const result = await service.createProduct(
        'company-1',
        { manufacturerId: 'manufacturer-1', name: 'Rower X' },
        'user-1',
      );

      expect(result.id).toBe('product-1');
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          userId: 'user-1',
          action: 'PRODUCT_CREATED',
          entityType: 'Product',
          entityId: 'product-1',
        }),
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.PRODUCT_CREATED);
      expect(published.payload).toEqual({ name: 'Rower X' });
    });
  });

  describe('updateProduct', () => {
    it('rzuca NotFoundException, gdy produkt docelowy nie istnieje', async () => {
      productsRepository.findById.mockResolvedValue(null);
      await expect(
        service.updateProduct('brak', 'company-1', { name: 'X' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
      expect(productsRepository.update).not.toHaveBeenCalled();
    });

    it('NIE zapisuje AuditLog ani nie publikuje zdarzenia, gdy żadne pole faktycznie się nie zmieniło', async () => {
      const before = buildProduct();
      productsRepository.findById.mockResolvedValue(before);
      productsRepository.update.mockResolvedValue(before);

      await service.updateProduct('product-1', 'company-1', { name: before.name }, 'user-1');

      expect(auditRepository.create).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('zapisuje AuditLog z diffem TYLKO zmienionych pól i publikuje ProductUpdated', async () => {
      const before = buildProduct({ name: 'Rower X', sku: 'SKU-1' });
      const after = buildProduct({ name: 'Rower X2', sku: 'SKU-1' });
      productsRepository.findById.mockResolvedValue(before);
      productsRepository.update.mockResolvedValue(after);

      await service.updateProduct('product-1', 'company-1', { name: 'Rower X2' }, 'user-1');

      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_UPDATED',
          previousValue: { name: 'Rower X' },
          newValue: { name: 'Rower X2' },
        }),
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.PRODUCT_UPDATED);
      expect(published.payload).toEqual({ changedFields: ['name'] });
    });
  });

  describe('findBrandById', () => {
    it('rzuca NotFoundException, gdy marka nie istnieje', async () => {
      productsRepository.findBrandById.mockResolvedValue(null);
      await expect(service.findBrandById('brak', 'company-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createBrand', () => {
    it('weryfikuje istnienie manufacturerId PRZED zapisem', async () => {
      manufacturersService.findById.mockRejectedValue(new NotFoundException());
      await expect(
        service.createBrand('company-1', { manufacturerId: 'brak', name: 'Acme' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
      expect(productsRepository.createBrand).not.toHaveBeenCalled();
    });

    it('zapisuje AuditLog i publikuje BrandCreated', async () => {
      const brand = buildBrand();
      productsRepository.createBrand.mockResolvedValue(brand);

      const result = await service.createBrand(
        'company-1',
        { manufacturerId: 'manufacturer-1', name: 'Acme' },
        'user-1',
      );

      expect(result.id).toBe('brand-1');
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BRAND_CREATED',
          entityType: 'Brand',
          entityId: 'brand-1',
        }),
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.BRAND_CREATED);
      expect(published.payload).toEqual({ name: 'Acme' });
    });
  });

  describe('updateBrand', () => {
    it('rzuca NotFoundException, gdy marka docelowa nie istnieje', async () => {
      productsRepository.findBrandById.mockResolvedValue(null);
      await expect(
        service.updateBrand('brak', 'company-1', { name: 'X' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
      expect(productsRepository.updateBrand).not.toHaveBeenCalled();
    });

    it('zapisuje AuditLog z diffem i publikuje BrandUpdated TYLKO gdy pola faktycznie się zmieniły', async () => {
      const before = buildBrand({ name: 'Acme' });
      const after = buildBrand({ name: 'Acme Corp' });
      productsRepository.findBrandById.mockResolvedValue(before);
      productsRepository.updateBrand.mockResolvedValue(after);

      await service.updateBrand('brand-1', 'company-1', { name: 'Acme Corp' }, 'user-1');

      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BRAND_UPDATED',
          previousValue: { name: 'Acme' },
          newValue: { name: 'Acme Corp' },
        }),
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.BRAND_UPDATED);
      expect(published.payload).toEqual({ changedFields: ['name'] });
    });
  });
});
