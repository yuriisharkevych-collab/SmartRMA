import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import * as path from 'node:path';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { AuthTokensEntity } from '../auth/entities/auth-tokens.entity';
import { CompaniesService } from './companies.service';
import { CompanySignupDto } from './dto/company-signup.dto';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { CompanyEntity } from './entities/company.entity';
import { ShopEntity } from './entities/shop.entity';

const LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB — logo, nie zdjęcie uszkodzenia; nie ma powodu pozwalać na więcej.

const EXTENSION_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};

/**
 * RBAC.md §2 zna wyłącznie `company.manage`/`shops.manage` — brak
 * list/deactivate/reactivate dla Company (jedyny wyjątek: `signup` niżej,
 * Etap 6). Shop ma pełne CRUD + dezaktywację pod `shops.manage`.
 */
@ApiTags('Companies')
@ApiBearerAuth()
@Controller()
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  // --- Etap 6 — onboarding samoobsługowy, publiczny, bez sesji ---

  @Public()
  @Post('companies/signup')
  @HttpCode(HttpStatus.CREATED)
  // Podstawowa ochrona przed mass-signup — nie CAPTCHA/antyfraud (świadomie
  // poza zakresem Etapu 6), tylko twardy sufit per adres IP, ten sam wzorzec
  // co `IntakeController.submitComplaint`/`submitBrandComplaint` (jedyne inne
  // publiczne endpointy tworzące realne rekordy w bazie).
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @ApiOperation({
    summary:
      'Onboarding nowej firmy Producent/Dystrybutor — bez sesji, bez SQL/skryptu developerskiego',
    description:
      'Zakłada Company+CompanySettings+Shop+samoopisany profil+katalog statusów+PIERWSZEGO Administratora w jednej transakcji i od razu loguje (zwraca AuthTokens) — ten sam wzorzec co `POST /partnerships/invite/:token/accept`.',
  })
  @ApiBody({ type: CompanySignupDto })
  @ApiResponse({ status: 201, description: 'Firma założona, zalogowano nowego Administratora.' })
  @ApiResponse({
    status: 409,
    description: 'USER-001 (e-mail zajęty) albo COMPANY-001 (slug wyczerpany).',
  })
  signup(@Body() dto: CompanySignupDto): Promise<AuthTokensEntity> {
    return this.companiesService.signup(dto);
  }

  @Get('companies/me')
  @ApiOperation({
    summary: 'Dane własnej firmy',
    description:
      'Bez dodatkowego uprawnienia poza uwierzytelnieniem — BR-086, każdy zalogowany użytkownik widzi firmę, do której należy.',
  })
  @ApiResponse({ status: 200, description: 'Firma znaleziona.', type: CompanyEntity })
  findMyCompany(@CurrentUser() user: AuthenticatedUser): Promise<CompanyEntity> {
    return this.companiesService.findById(user.companyId);
  }

  @Patch('companies/me')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE)
  @ApiOperation({
    summary: 'Edycja danych własnej firmy',
    description:
      'Tworzenie/dezaktywacja Company nie są tu dostępne celowo (BR-086, RBAC.md §2 — brak odpowiednich uprawnień).',
  })
  @ApiBody({ type: UpdateCompanyDto })
  @ApiResponse({ status: 200, description: 'Firma zaktualizowana.', type: CompanyEntity })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `company.manage`.' })
  updateMyCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCompanyDto,
  ): Promise<CompanyEntity> {
    return this.companiesService.update(user.companyId, dto, user.userId);
  }

  @Post('companies/me/logo')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({
    summary:
      'Wgranie/podmiana logo firmy — pojawia się na wydrukach i (docelowo) w portalu klienta',
  })
  @ApiResponse({ status: 201, description: 'Logo zapisane.', type: CompanyEntity })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `company.manage`.' })
  uploadLogo(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: LOGO_MAX_SIZE_BYTES, message: 'FILE-001' }),
          new FileTypeValidator({ fileType: /^image\/(png|jpe?g|webp|svg\+xml|gif)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CompanyEntity> {
    return this.companiesService.uploadLogo(user.companyId, file, user.userId);
  }

  @Get('companies/:id/logo')
  @Public()
  @ApiOperation({
    summary: 'Logo firmy — publiczny (bez uwierzytelnienia)',
    description:
      'Logo firmy nie jest daną wrażliwą; publiczny dostęp jest potrzebny na wydrukach otwieranych bez sesji i w przyszłym portalu klienta.',
  })
  @ApiResponse({ status: 200, description: 'Plik graficzny.' })
  @ApiResponse({ status: 404, description: 'Firma nie ma jeszcze wgranego logo.' })
  async getLogo(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const { buffer, storagePath } = await this.companiesService.getLogoBuffer(id);
    const extension = path.extname(storagePath).toLowerCase();
    res.setHeader('Content-Type', EXTENSION_TO_MIME[extension] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=300');
    // Helmet (main.ts) ustawia domyślnie `Cross-Origin-Resource-Policy: same-origin`
    // globalnie — poprawne dla JSON API, ale blokuje osadzenie TEGO obrazu w
    // <img src> z origin frontendu (inny port w dev, inna domena w prod).
    // Nadpisanie punktowe, tylko na tym publicznym endpointzie, bez zmiany
    // polityki dla reszty API.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(buffer);
  }

  @Get('shops')
  @RequirePermissions(PERMISSIONS.SHOPS_MANAGE, PERMISSIONS.CASES_VIEW)
  @ApiOperation({
    summary: 'Lista placówek firmy',
    description:
      'Dostępne dla `shops.manage` LUB `cases.view` (RBAC.md §4 — którekolwiek z uprawnień).',
  })
  @ApiResponse({ status: 200, description: 'Lista placówek.', type: [ShopEntity] })
  @ApiResponse({
    status: 403,
    description: 'RBAC-001 — brak uprawnienia `shops.manage`/`cases.view`.',
  })
  findShops(@CurrentUser() user: AuthenticatedUser): Promise<ShopEntity[]> {
    return this.companiesService.findShops(user.companyId);
  }

  @Post('shops')
  @RequirePermissions(PERMISSIONS.SHOPS_MANAGE)
  @ApiOperation({ summary: 'Utworzenie placówki' })
  @ApiBody({ type: CreateShopDto })
  @ApiResponse({ status: 201, description: 'Placówka utworzona.', type: ShopEntity })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `shops.manage`.' })
  createShop(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateShopDto,
  ): Promise<ShopEntity> {
    return this.companiesService.createShop(user.companyId, dto, user.userId);
  }

  @Patch('shops/:id')
  @RequirePermissions(PERMISSIONS.SHOPS_MANAGE)
  @ApiOperation({ summary: 'Edycja placówki' })
  @ApiBody({ type: UpdateShopDto })
  @ApiResponse({ status: 200, description: 'Placówka zaktualizowana.', type: ShopEntity })
  @ApiResponse({
    status: 404,
    description: 'Nie znaleziono placówki (brak dedykowanego kodu SHOP-* w ERROR_CODES.md).',
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `shops.manage`.' })
  updateShop(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShopDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShopEntity> {
    return this.companiesService.updateShop(id, user.companyId, dto, user.userId);
  }

  @Post('shops/:id/deactivate')
  @RequirePermissions(PERMISSIONS.SHOPS_MANAGE)
  @ApiOperation({
    summary: 'Dezaktywacja placówki (soft delete przez `active=false`, nigdy fizyczne usunięcie)',
  })
  @ApiResponse({ status: 201, description: 'Placówka dezaktywowana.', type: ShopEntity })
  @ApiResponse({
    status: 404,
    description: 'Nie znaleziono placówki (brak dedykowanego kodu SHOP-* w ERROR_CODES.md).',
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `shops.manage`.' })
  deactivateShop(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShopEntity> {
    return this.companiesService.deactivateShop(id, user.companyId, user.userId);
  }
}
