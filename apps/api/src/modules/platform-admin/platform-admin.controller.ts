import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentPlatformAdmin } from './decorators/current-platform-admin.decorator';
import { PlatformAdminProfileEntity } from './entities/platform-admin-profile.entity';
import { PlatformCompanySummaryEntity } from './entities/platform-company-summary.entity';
import { PlatformAdminPrincipal } from './interfaces/platform-authenticated-request.interface';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformAuthGuard } from './platform-auth.guard';

/**
 * `@Public()` = pomija `JwtAuthGuard` PRACOWNICZY (globalny, `jwt.accessSecret`)
 * — te endpointy mają WŁASNĄ bramkę, `PlatformAuthGuard`
 * (`platformAuth.jwtSecret`, całkowicie osobny sekret). Token pracownika
 * nigdy tu nie przejdzie (zły sekret = zła sygnatura), token Platform Admina
 * nigdy nie przejdzie przez żaden endpoint pracowniczy — patrz doc-comment
 * `PlatformAuthGuard`.
 */
@ApiTags('Platform Admin')
@Public()
@UseGuards(PlatformAuthGuard)
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  @Get('me')
  @ApiOperation({ summary: 'Profil zalogowanego administratora platformy' })
  @ApiResponse({ status: 200, type: PlatformAdminProfileEntity })
  getMe(
    @CurrentPlatformAdmin() principal: PlatformAdminPrincipal,
  ): Promise<PlatformAdminProfileEntity> {
    return this.platformAdminService.getProfile(principal.platformAdminId);
  }

  @Get('companies')
  @ApiOperation({
    summary: 'Przegląd firm (fresh-install/onboarding) — WYŁĄCZNIE podstawowe pola',
    description:
      'Bez użytkowników/spraw/katalogu/ustawień e-mail żadnej firmy — Platform Admin nie ma w tej fazie dostępu do danych wewnątrz tenantów.',
  })
  @ApiResponse({ status: 200, type: [PlatformCompanySummaryEntity] })
  listCompanies(): Promise<PlatformCompanySummaryEntity[]> {
    return this.platformAdminService.listCompanies();
  }
}
