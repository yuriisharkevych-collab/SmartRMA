import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CreateBrandDto } from './dto/create-brand.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { SearchCatalogDto } from './dto/search-catalog.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { BrandEntity, ProductCategoryEntity, ProductEntity } from './entities/product.entity';
import { ProductsService } from './products.service';

/**
 * RBAC.md zna `products.view`/`products.manage` (moduł "Customers / Products
 * / Orders") oraz `brands.manage` (moduł "Manufacturers / Brands", bez
 * odpowiednika `brands.view`) — odczyt Brand gated tym samym `brands.manage`,
 * bo to jedyne udokumentowane uprawnienie dla tego zasobu. Etap 4 — kategorie
 * produktowe (`ProductCategory`) idą pod TE SAME `products.view`/`products.manage`,
 * zero nowego klucza RBAC (to sub-zasób katalogu produktów, nie osobny moduł).
 */
@ApiTags('Products')
@ApiBearerAuth()
@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('products')
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  @ApiOperation({
    summary: 'Lista/wyszukiwanie produktów katalogu',
    description:
      'Bez `query` — pełna lista firmy. Z `query` — wyszukiwanie po nazwie/SKU/kategorii. Etap 4 — filtry `manufacturerId`/`brandId`/`categoryId`/`active` (panel "Produkty").',
  })
  @ApiResponse({ status: 200, description: 'Lista produktów.', type: [ProductEntity] })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `products.view`.' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchCatalogDto,
  ): Promise<ProductEntity[]> {
    return this.productsService.listProducts(user.companyId, query);
  }

  @Get('products/:id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Szczegóły pozycji katalogowej' })
  @ApiResponse({ status: 200, description: 'Produkt znaleziony.', type: ProductEntity })
  @ApiResponse({
    status: 404,
    description: 'Nie znaleziono produktu (brak dedykowanego kodu PRODUCT-* w ERROR_CODES.md).',
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `products.view`.' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductEntity> {
    return this.productsService.findById(id, user.companyId);
  }

  @Post('products')
  @RequirePermissions(PERMISSIONS.PRODUCTS_MANAGE)
  @ApiOperation({
    summary: 'Dodanie pozycji katalogowej',
    description: 'BR-074 — Product to typ/model, nie egzemplarz zakupiony (ten żyje na OrderItem).',
  })
  @ApiBody({ type: CreateProductDto })
  @ApiResponse({ status: 201, description: 'Produkt utworzony.', type: ProductEntity })
  @ApiResponse({
    status: 404,
    description: 'Nie znaleziono `manufacturerId`/`brandId`/`categoryId`.',
  })
  @ApiResponse({ status: 422, description: 'VALIDATION-001 — pola wymagane.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `products.manage`.' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ): Promise<ProductEntity> {
    return this.productsService.createProduct(user.companyId, dto, user.userId);
  }

  @Patch('products/:id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_MANAGE)
  @ApiOperation({
    summary: 'Edycja pozycji katalogowej (w tym dezaktywacja przez `active:false`)',
  })
  @ApiBody({ type: UpdateProductDto })
  @ApiResponse({ status: 200, description: 'Produkt zaktualizowany.', type: ProductEntity })
  @ApiResponse({
    status: 404,
    description: 'Nie znaleziono produktu/`manufacturerId`/`brandId`/`categoryId`.',
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `products.manage`.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductEntity> {
    return this.productsService.updateProduct(id, user.companyId, dto, user.userId);
  }

  @Get('brands')
  @RequirePermissions(PERMISSIONS.BRANDS_MANAGE)
  @ApiOperation({
    summary: 'Lista/wyszukiwanie marek',
    description: 'Bez `query` — pełna lista firmy. Z `query` — wyszukiwanie po nazwie.',
  })
  @ApiResponse({ status: 200, description: 'Lista marek.', type: [BrandEntity] })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `brands.manage`.' })
  findAllBrands(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchCatalogDto,
  ): Promise<BrandEntity[]> {
    return query.query
      ? this.productsService.searchBrands(user.companyId, query.query)
      : this.productsService.listBrands(user.companyId);
  }

  @Get('brands/:id')
  @RequirePermissions(PERMISSIONS.BRANDS_MANAGE)
  @ApiOperation({ summary: 'Szczegóły marki' })
  @ApiResponse({ status: 200, description: 'Marka znaleziona.', type: BrandEntity })
  @ApiResponse({
    status: 404,
    description: 'Nie znaleziono marki (brak dedykowanego kodu BRAND-* w ERROR_CODES.md).',
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `brands.manage`.' })
  findOneBrand(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BrandEntity> {
    return this.productsService.findBrandById(id, user.companyId);
  }

  @Post('brands')
  @RequirePermissions(PERMISSIONS.BRANDS_MANAGE)
  @ApiOperation({
    summary: 'Utworzenie marki',
    description: 'BR-076 — marka jest polem pomocniczym przy wyborze producenta, nie zastępuje go.',
  })
  @ApiBody({ type: CreateBrandDto })
  @ApiResponse({ status: 201, description: 'Marka utworzona.', type: BrandEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono `manufacturerId`.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `brands.manage`.' })
  createBrand(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBrandDto,
  ): Promise<BrandEntity> {
    return this.productsService.createBrand(user.companyId, dto, user.userId);
  }

  @Patch('brands/:id')
  @RequirePermissions(PERMISSIONS.BRANDS_MANAGE)
  @ApiOperation({ summary: 'Edycja marki' })
  @ApiBody({ type: UpdateBrandDto })
  @ApiResponse({ status: 200, description: 'Marka zaktualizowana.', type: BrandEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono marki/`manufacturerId`.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `brands.manage`.' })
  updateBrand(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBrandDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BrandEntity> {
    return this.productsService.updateBrand(id, user.companyId, dto, user.userId);
  }

  // --- Etap 4 (Produkty i konfiguracja formularza) — ProductCategory ---

  @Get('product-categories')
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  @ApiOperation({
    summary: 'Lista kategorii produktowych',
    description:
      'Bez `manufacturerId` — wszystkie kategorie firmy (panel). Z `manufacturerId` — kategorie TEGO producenta (formularz publiczny, krok "Kategoria"). `?active=true` zawęża do aktywnych.',
  })
  @ApiResponse({ status: 200, description: 'Lista kategorii.', type: [ProductCategoryEntity] })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `products.view`.' })
  findAllCategories(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchCatalogDto,
  ): Promise<ProductCategoryEntity[]> {
    return this.productsService.listCategories(user.companyId, query.manufacturerId, query.active);
  }

  @Get('product-categories/:id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Szczegóły kategorii produktowej' })
  @ApiResponse({ status: 200, description: 'Kategoria znaleziona.', type: ProductCategoryEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono kategorii.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `products.view`.' })
  findOneCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductCategoryEntity> {
    return this.productsService.findCategoryById(id, user.companyId);
  }

  @Post('product-categories')
  @RequirePermissions(PERMISSIONS.PRODUCTS_MANAGE)
  @ApiOperation({
    summary: 'Utworzenie kategorii produktowej',
    description:
      'Kategoria należy do dokładnie jednego producenta — druga firma nigdy nie widzi/nie może użyć cudzej kategorii.',
  })
  @ApiBody({ type: CreateProductCategoryDto })
  @ApiResponse({ status: 201, description: 'Kategoria utworzona.', type: ProductCategoryEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono `manufacturerId`.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `products.manage`.' })
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductCategoryDto,
  ): Promise<ProductCategoryEntity> {
    return this.productsService.createCategory(user.companyId, dto, user.userId);
  }

  @Patch('product-categories/:id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_MANAGE)
  @ApiOperation({
    summary: 'Zmiana nazwy / dezaktywacja kategorii',
    description:
      'Dezaktywacja (`active:false`) NIGDY nie usuwa kategorię ani nie zmienia `Product.categoryId` istniejących produktów/spraw.',
  })
  @ApiBody({ type: UpdateProductCategoryDto })
  @ApiResponse({
    status: 200,
    description: 'Kategoria zaktualizowana.',
    type: ProductCategoryEntity,
  })
  @ApiResponse({ status: 404, description: 'Nie znaleziono kategorii.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `products.manage`.' })
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductCategoryEntity> {
    return this.productsService.updateCategory(id, user.companyId, dto, user.userId);
  }
}
