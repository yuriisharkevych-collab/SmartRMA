import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import * as path from 'node:path';
import { Public } from '../../common/decorators/public.decorator';
import { SubmitBrandComplaintDto } from './dto/submit-brand-complaint.dto';
import { SubmitPublicComplaintDto } from './dto/submit-public-complaint.dto';
import { PublicCompanyBrandingEntity } from './entities/public-company-branding.entity';
import { PublicComplaintCreatedEntity } from './entities/public-complaint-created.entity';
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
