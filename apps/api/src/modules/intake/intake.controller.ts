import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import * as path from 'node:path';
import { Public } from '../../common/decorators/public.decorator';
import { SubmitBrandComplaintDto } from './dto/submit-brand-complaint.dto';
import { SubmitPublicComplaintDto } from './dto/submit-public-complaint.dto';
import { PublicCompanyBrandingEntity } from './entities/public-company-branding.entity';
import { PublicComplaintCreatedEntity } from './entities/public-complaint-created.entity';
import {
  PublicBrandEntity,
  PublicProductCategoryEntity,
  PublicProductEntity,
  PublicRequirementsEntity,
} from './entities/public-catalog.entity';
import { PublicManufacturerEntity } from './entities/public-manufacturer.entity';
import { PublicPartnerEntity } from './entities/public-partner.entity';
import { IntakeService } from './intake.service';

const EXTENSION_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};

/**
 * Publiczny Formularz Reklamacyjny — jedyna gałąź API w SmartRMA dostępna BEZ
 * żadnego uwierzytelnienia i BEZ istniejącego wcześniej zasobu (Portal Klienta
 * wymaga chociaż tokenu wystawionego dla konkretnej sprawy). `POST /intake/:orgSlug/complaints`
 * ma dodatkowy, ostrzejszy throttling niż globalny limit — tworzy realne rekordy
 * (Customer/Product/Case) i wysyła e-mail, więc jest naturalnym celem nadużyć.
 */
@ApiTags('Intake')
@Controller('intake')
export class IntakeController {
  constructor(private readonly intakeService: IntakeService) {}

  @Public()
  @Get(':orgSlug/company')
  getBranding(@Param('orgSlug') orgSlug: string): Promise<PublicCompanyBrandingEntity> {
    return this.intakeService.getBranding(orgSlug);
  }

  @Public()
  @Get(':orgSlug/manufacturers')
  getManufacturers(@Param('orgSlug') orgSlug: string): Promise<PublicManufacturerEntity[]> {
    return this.intakeService.getManufacturers(orgSlug);
  }

  // --- Etap 4 (Produkty i konfiguracja formularza) — katalog TEGO producenta
  // w formularzu firmowym (`/reklamacja/:orgSlug`, może obsługiwać wielu
  // producentów naraz — stąd `manufacturerId` w ścieżce). Ten sam kształt
  // odpowiedzi co formularz marki niżej (`brand/:brandSlug/...`), bo to
  // DOKŁADNIE ten sam mechanizm — jeden katalog, dwa wejścia. ---

  @Public()
  @Get(':orgSlug/manufacturers/:manufacturerId/brands')
  getManufacturerBrands(
    @Param('orgSlug') orgSlug: string,
    @Param('manufacturerId', ParseUUIDPipe) manufacturerId: string,
  ): Promise<PublicBrandEntity[]> {
    return this.intakeService.getManufacturerBrands(orgSlug, manufacturerId);
  }

  @Public()
  @Get(':orgSlug/manufacturers/:manufacturerId/categories')
  getManufacturerCategories(
    @Param('orgSlug') orgSlug: string,
    @Param('manufacturerId', ParseUUIDPipe) manufacturerId: string,
  ): Promise<PublicProductCategoryEntity[]> {
    return this.intakeService.getManufacturerCategories(orgSlug, manufacturerId);
  }

  @Public()
  @Get(':orgSlug/manufacturers/:manufacturerId/products')
  getManufacturerProducts(
    @Param('orgSlug') orgSlug: string,
    @Param('manufacturerId', ParseUUIDPipe) manufacturerId: string,
    @Query('brandId') brandId?: string,
    @Query('categoryId') categoryId?: string,
  ): Promise<PublicProductEntity[]> {
    return this.intakeService.getManufacturerProducts(orgSlug, manufacturerId, brandId, categoryId);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @Post(':orgSlug/complaints')
  @HttpCode(HttpStatus.CREATED)
  submitComplaint(
    @Param('orgSlug') orgSlug: string,
    @Body() dto: SubmitPublicComplaintDto,
    @Req() req: Request,
  ): Promise<PublicComplaintCreatedEntity> {
    return this.intakeService.submitComplaint(
      orgSlug,
      dto,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );
  }

  // --- Formularz rozgałęziony marki (np. Veres Meble) — patrz komentarz przy
  // `Manufacturer.publicFormSlug` w schemacie. Prefiks `brand/` — inna
  // przestrzeń identyfikatorów niż `orgSlug` (Company.slug), żeby oba
  // formularze mogły działać obok siebie bez kolizji tras. ---

  @Public()
  @Get('brand/:brandSlug/company')
  getBrandBranding(@Param('brandSlug') brandSlug: string): Promise<PublicCompanyBrandingEntity> {
    return this.intakeService.getBrandBranding(brandSlug);
  }

  @Public()
  @Get('brand/:brandSlug/manufacturer')
  getBrandManufacturer(@Param('brandSlug') brandSlug: string): Promise<PublicManufacturerEntity> {
    return this.intakeService.getBrandManufacturer(brandSlug);
  }

  @Public()
  @Get('brand/:brandSlug/partners')
  getBrandPartners(@Param('brandSlug') brandSlug: string): Promise<PublicPartnerEntity[]> {
    return this.intakeService.getBrandPartners(brandSlug);
  }

  // --- Etap 4 (Produkty i konfiguracja formularza) — Organizacja → Producent →
  // Marka → Kategoria → Produkt. Zastępuje dawny wolny tekst `productName` +
  // płaską listę `Manufacturer.productCategories` z Etapu 3. ---

  @Public()
  @Get('brand/:brandSlug/brands')
  @ApiOperation({
    summary: 'Krok "Marka"',
    description:
      'Puste/1-elementowe — frontend pomija ten krok (auto-wybór jedynej marki). `partnerCompanyId` (Etap 5, krok "Partner" formularza B2B) zawęża do marek objętych `PartnershipBrand` tego partnera — wyłącznie UX, granica bezpieczeństwa jest w `POST .../complaints`.',
  })
  getBrandBrands(
    @Param('brandSlug') brandSlug: string,
    @Query('partnerCompanyId') partnerCompanyId?: string,
  ): Promise<PublicBrandEntity[]> {
    return this.intakeService.getBrandBrands(brandSlug, partnerCompanyId);
  }

  @Public()
  @Get('brand/:brandSlug/categories')
  @ApiOperation({ summary: 'Krok "Kategoria" — zastępuje dawną `productCategories` (Etap 3)' })
  getBrandCategories(
    @Param('brandSlug') brandSlug: string,
  ): Promise<PublicProductCategoryEntity[]> {
    return this.intakeService.getBrandCategories(brandSlug);
  }

  @Public()
  @Get('brand/:brandSlug/products')
  @ApiOperation({
    summary: 'Krok "Produkt" — zawężony opcjonalnie po `brandId`/`categoryId`',
  })
  getBrandProducts(
    @Param('brandSlug') brandSlug: string,
    @Query('brandId') brandId?: string,
    @Query('categoryId') categoryId?: string,
  ): Promise<PublicProductEntity[]> {
    return this.intakeService.getBrandProducts(brandSlug, brandId, categoryId);
  }

  @Public()
  @Get('brand/:brandSlug/requirements')
  @ApiOperation({
    summary: 'Wymagania rozwiązane DLA WYBRANEJ marki',
    description:
      'Ten sam resolver co `CasesService`/Portal Klienta (`resolveRequirements`) — checklista formularza pokazuje dokładnie to, co faktycznie zostanie wyegzekwowane po wysłaniu.',
  })
  getBrandRequirements(
    @Param('brandSlug') brandSlug: string,
    @Query('brandId') brandId?: string,
  ): Promise<PublicRequirementsEntity> {
    return this.intakeService.getBrandRequirements(brandSlug, brandId);
  }

  @Public()
  @Get('brand/:brandSlug/logo')
  @ApiOperation({ summary: 'Logo marki — publiczny (bez uwierzytelnienia)' })
  async getBrandLogo(@Param('brandSlug') brandSlug: string, @Res() res: Response): Promise<void> {
    const { buffer, storagePath } = await this.intakeService.getBrandLogoBuffer(brandSlug);
    const extension = path.extname(storagePath).toLowerCase();
    res.setHeader('Content-Type', EXTENSION_TO_MIME[extension] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(buffer);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @Post('brand/:brandSlug/complaints')
  @HttpCode(HttpStatus.CREATED)
  submitBrandComplaint(
    @Param('brandSlug') brandSlug: string,
    @Body() dto: SubmitBrandComplaintDto,
    @Req() req: Request,
  ): Promise<PublicComplaintCreatedEntity> {
    return this.intakeService.submitBrandComplaint(
      brandSlug,
      dto,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );
  }
}
