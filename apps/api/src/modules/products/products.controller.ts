import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CreateBrandDto } from './dto/create-brand.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { SearchCatalogDto } from './dto/search-catalog.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BrandEntity, ProductEntity } from './entities/product.entity';
import { ProductsService } from './products.service';

/**
 * RBAC.md zna `products.view`/`products.manage` (moduł "Customers / Products
 * / Orders") oraz `brands.manage` (moduł "Manufacturers / Brands", bez
 * odpowiednika `brands.view`) — odczyt Brand gated tym samym `brands.manage`,
 * bo to jedyne udokumentowane uprawnienie dla tego zasobu.
 */
@ApiTags('Products')
@ApiBearerAuth()
@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('products')
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Lista/wyszukiwanie produktów katalogu', description: 'Bez `query` — pełna lista firmy. Z `query` — wyszukiwanie po nazwie/SKU/kategorii.' })
  @ApiResponse({ status: 200, description: 'Lista produktów.', type: [ProductEntity] })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `products.view`.' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchCatalogDto): Promise<ProductEntity[]> {
    return query.query
      ? this.productsService.searchProducts(user.companyId, query.query)
      : this.productsService.listProducts(user.companyId);
  }

  @Get('products/:id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Szczegóły pozycji katalogowej' })
  @ApiResponse({ status: 200, description: 'Produkt znaleziony.', type: ProductEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono produktu (brak dedykowanego kodu PRODUCT-* w ERROR_CODES.md).' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `products.view`.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProductEntity> {
    return this.productsService.findById(id);
  }

  @Post('products')
  @RequirePermissions(PERMISSIONS.PRODUCTS_MANAGE)
  @ApiOperation({ summary: 'Dodanie pozycji katalogowej', description: 'BR-074 — Product to typ/model, nie egzemplarz zakupiony (ten żyje na OrderItem).' })
  @ApiBody({ type: CreateProductDto })
  @ApiResponse({ status: 201, description: 'Produkt utworzony.', type: ProductEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono `manufacturerId`/`brandId`.' })
  @ApiResponse({ status: 422, description: 'VALIDATION-001 — pola wymagane.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `products.manage`.' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto): Promise<ProductEntity> {
    return this.productsService.createProduct(user.companyId, dto, user.userId);
  }

  @Patch('products/:id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_MANAGE)
  @ApiOperation({ summary: 'Edycja pozycji katalogowej' })
  @ApiBody({ type: UpdateProductDto })
  @ApiResponse({ status: 200, description: 'Produkt zaktualizowany.', type: ProductEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono produktu/`manufacturerId`/`brandId`.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `products.manage`.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductEntity> {
    return this.productsService.updateProduct(id, dto, user.userId);
  }

  @Get('brands')
  @RequirePermissions(PERMISSIONS.BRANDS_MANAGE)
  @ApiOperation({ summary: 'Lista/wyszukiwanie marek', description: 'Bez `query` — pełna lista firmy. Z `query` — wyszukiwanie po nazwie.' })
  @ApiResponse({ status: 200, description: 'Lista marek.', type: [BrandEntity] })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `brands.manage`.' })
  findAllBrands(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchCatalogDto): Promise<BrandEntity[]> {
    return query.query
      ? this.productsService.searchBrands(user.companyId, query.query)
      : this.productsService.listBrands(user.companyId);
  }

  @Get('brands/:id')
  @RequirePermissions(PERMISSIONS.BRANDS_MANAGE)
  @ApiOperation({ summary: 'Szczegóły marki' })
  @ApiResponse({ status: 200, description: 'Marka znaleziona.', type: BrandEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono marki (brak dedykowanego kodu BRAND-* w ERROR_CODES.md).' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `brands.manage`.' })
  findOneBrand(@Param('id', ParseUUIDPipe) id: string): Promise<BrandEntity> {
    return this.productsService.findBrandById(id);
  }

  @Post('brands')
  @RequirePermissions(PERMISSIONS.BRANDS_MANAGE)
  @ApiOperation({ summary: 'Utworzenie marki', description: 'BR-076 — marka jest polem pomocniczym przy wyborze producenta, nie zastępuje go.' })
  @ApiBody({ type: CreateBrandDto })
  @ApiResponse({ status: 201, description: 'Marka utworzona.', type: BrandEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono `manufacturerId`.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `brands.manage`.' })
  createBrand(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBrandDto): Promise<BrandEntity> {
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
    return this.productsService.updateBrand(id, dto, user.userId);
  }
}
