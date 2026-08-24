import { Body, Controller, Get, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { UpdateAiDto } from './dto/update-ai.dto';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { UpdateNumberingDto } from './dto/update-numbering.dto';
import { UpdateRemindersDto } from './dto/update-reminders.dto';
import { UpdateSecurityDto } from './dto/update-security.dto';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { SettingEntity } from './entities/setting.entity';
import {
  AiSettingsEntity,
  EmailSettingsEntity,
  SettingsOverviewEntity,
} from './entities/settings-overview.entity';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_VIEW)
  @ApiOperation({
    summary:
      'Ustawienia klucz/wartość (reguły biznesowe, DATABASE.md §30) — nie mylić z /settings/overview.',
  })
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<SettingEntity[]> {
    return this.settingsService.findAllForCompany(user.companyId);
  }

  @Put()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertSettingDto,
  ): Promise<SettingEntity> {
    return this.settingsService.upsert(user.companyId, dto);
  }

  @Get('overview')
  @RequirePermissions(PERMISSIONS.SETTINGS_VIEW)
  @ApiOperation({
    summary:
      'Ekran administracyjny Ustawienia — numeracja, bezpieczeństwo, backup, AI, statystyki systemu',
  })
  @ApiResponse({
    status: 200,
    description: 'Komplet ustawień firmy.',
    type: SettingsOverviewEntity,
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `settings.view`.' })
  getOverview(@CurrentUser() user: AuthenticatedUser): Promise<SettingsOverviewEntity> {
    return this.settingsService.getOverview(user.companyId);
  }

  @Patch('numbering')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary:
      'Numeracja reklamacji — prefiks/format/reset roczny. Wpływa WYŁĄCZNIE na przyszłe sprawy.',
  })
  @ApiResponse({
    status: 200,
    description: 'Zaktualizowane ustawienia.',
    type: SettingsOverviewEntity,
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `settings.manage`.' })
  updateNumbering(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNumberingDto,
  ): Promise<SettingsOverviewEntity> {
    return this.settingsService.updateNumbering(user.companyId, dto);
  }

  @Patch('security')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Polityka haseł, długość sesji, blokada konta' })
  @ApiResponse({
    status: 200,
    description: 'Zaktualizowane ustawienia.',
    type: SettingsOverviewEntity,
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `settings.manage`.' })
  updateSecurity(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSecurityDto,
  ): Promise<SettingsOverviewEntity> {
    return this.settingsService.updateSecurity(user.companyId, dto);
  }

  @Patch('reminders')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary:
      'Progi domyślne przypomnień o reakcji ("brak zmiany statusu" / "dni od zgłoszenia") — nadpisanie per producent w Ustawienia → Producenci.',
  })
  @ApiResponse({
    status: 200,
    description: 'Zaktualizowane ustawienia.',
    type: SettingsOverviewEntity,
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `settings.manage`.' })
  updateReminders(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateRemindersDto,
  ): Promise<SettingsOverviewEntity> {
    return this.settingsService.updateReminders(user.companyId, dto);
  }

  @Patch('ai')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary:
      'SmartRMA AI — konfiguracja planowanego modułu (żadna flaga nie steruje jeszcze istniejącą logiką)',
  })
  @ApiResponse({ status: 200, description: 'Zaktualizowane flagi.', type: AiSettingsEntity })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `settings.manage`.' })
  updateAi(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAiDto,
  ): Promise<AiSettingsEntity> {
    return this.settingsService.updateAi(user.companyId, dto);
  }

  @Patch('email')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary:
      'Konfiguracja wysyłki e-mail — nadawca, SMTP/Resend. Hasła/klucze zapisywane wyłącznie zaszyfrowane, nigdy nie są zwracane.',
  })
  @ApiResponse({
    status: 200,
    description: 'Zaktualizowana konfiguracja (bez sekretów).',
    type: EmailSettingsEntity,
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `settings.manage`.' })
  updateEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateEmailSettingsDto,
  ): Promise<EmailSettingsEntity> {
    return this.settingsService.updateEmail(user.companyId, user.userId, dto);
  }

  @Post('email/test-send')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary:
      'Wysyła wiadomość testową przy użyciu AKTUALNIE ZAPISANEJ konfiguracji e-mail (zapisz ustawienia przed testem).',
  })
  @ApiResponse({ status: 201, description: 'Wiadomość wysłana.' })
  @ApiResponse({
    status: 502,
    description: 'NOTIFICATION-001 — błąd dostawcy e-mail, treść zawiera szczegóły z transportu.',
  })
  sendTestEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendTestEmailDto,
  ): Promise<{ success: true }> {
    return this.settingsService.sendTestEmail(user.companyId, user.userId, dto);
  }
}
