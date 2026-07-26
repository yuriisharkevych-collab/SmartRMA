import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CompaniesService } from './companies.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { CompanyEntity } from './entities/company.entity';
import { ShopEntity } from './entities/shop.entity';

/**
 * RBAC.md §2 zna wyłącznie `company.manage`/`shops.manage` — brak
 * create/list/deactivate/reactivate dla Company (BR-086: jedna firma,
 * tworzona przez seed). Shop ma pełne CRUD + dezaktywację pod `shops.manage`.
 */
@ApiTags('Companies')
@ApiBearerAuth()
@Controller()
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('companies/me')
  @ApiOperation({ summary: 'Dane własnej firmy', description: 'Bez dodatkowego uprawnienia poza uwierzytelnieniem — BR-086, każdy zalogowany użytkownik widzi firmę, do której należy.' })
  @ApiResponse({ status: 200, description: 'Firma znaleziona.', type: CompanyEntity })
  findMyCompany(@CurrentUser() user: AuthenticatedUser): Promise<CompanyEntity> {
    return this.companiesService.findById(user.companyId);
  }

  @Patch('companies/me')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE)
  @ApiOperation({ summary: 'Edycja danych własnej firmy', description: 'Tworzenie/dezaktywacja Company nie są tu dostępne celowo (BR-086, RBAC.md §2 — brak odpowiednich uprawnień).' })
  @ApiBody({ type: UpdateCompanyDto })
  @ApiResponse({ status: 200, description: 'Firma zaktualizowana.', type: CompanyEntity })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `company.manage`.' })
  updateMyCompany(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCompanyDto): Promise<CompanyEntity> {
    return this.companiesService.update(user.companyId, dto, user.userId);
  }

  @Get('shops')
  @RequirePermissions(PERMISSIONS.SHOPS_MANAGE, PERMISSIONS.CASES_VIEW)
  @ApiOperation({ summary: 'Lista placówek firmy', description: 'Dostępne dla `shops.manage` LUB `cases.view` (RBAC.md §4 — którekolwiek z uprawnień).' })
  @ApiResponse({ status: 200, description: 'Lista placówek.', type: [ShopEntity] })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `shops.manage`/`cases.view`.' })
  findShops(@CurrentUser() user: AuthenticatedUser): Promise<ShopEntity[]> {
    return this.companiesService.findShops(user.companyId);
  }

  @Post('shops')
  @RequirePermissions(PERMISSIONS.SHOPS_MANAGE)
  @ApiOperation({ summary: 'Utworzenie placówki' })
  @ApiBody({ type: CreateShopDto })
  @ApiResponse({ status: 201, description: 'Placówka utworzona.', type: ShopEntity })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `shops.manage`.' })
  createShop(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateShopDto): Promise<ShopEntity> {
    return this.companiesService.createShop(user.companyId, dto, user.userId);
  }

  @Patch('shops/:id')
  @RequirePermissions(PERMISSIONS.SHOPS_MANAGE)
  @ApiOperation({ summary: 'Edycja placówki' })
  @ApiBody({ type: UpdateShopDto })
  @ApiResponse({ status: 200, description: 'Placówka zaktualizowana.', type: ShopEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono placówki (brak dedykowanego kodu SHOP-* w ERROR_CODES.md).' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `shops.manage`.' })
  updateShop(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShopDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShopEntity> {
    return this.companiesService.updateShop(id, dto, user.userId);
  }

  @Post('shops/:id/deactivate')
  @RequirePermissions(PERMISSIONS.SHOPS_MANAGE)
  @ApiOperation({ summary: 'Dezaktywacja placówki (soft delete przez `active=false`, nigdy fizyczne usunięcie)' })
  @ApiResponse({ status: 201, description: 'Placówka dezaktywowana.', type: ShopEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono placówki (brak dedykowanego kodu SHOP-* w ERROR_CODES.md).' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `shops.manage`.' })
  deactivateShop(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<ShopEntity> {
    return this.companiesService.deactivateShop(id, user.userId);
  }
}
