import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { NotificationTemplateEntity } from './entities/notification-template.entity';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';

/**
 * `notifications.view` (RBAC.md: "Przeglądanie historii wysłanych
 * powiadomień", macierz ról — wyłącznie Administrator/Kierownik) gated
 * WYŁĄCZNIE na trasach `/notifications`* (widok całej firmy). Trasy
 * `/notifications/me`* to zasób osobisty (własne powiadomienia) — bez
 * dodatkowego uprawnienia poza uwierzytelnieniem, wzorzec z
 * `GET /companies/me` (Zadanie 12).
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('notifications/me')
  @ApiOperation({ summary: 'Moje powiadomienia (dzwoneczek)', description: 'Bez uprawnienia `notifications.view` — zasób osobisty.' })
  @ApiResponse({ status: 200, description: 'Lista własnych powiadomień.', type: [NotificationEntity] })
  findMine(@CurrentUser() user: AuthenticatedUser): Promise<NotificationEntity[]> {
    return this.notificationsService.listMyNotifications(user.userId);
  }

  @Get('notifications/me/:id')
  @ApiOperation({ summary: 'Szczegóły własnego powiadomienia' })
  @ApiResponse({ status: 200, description: 'Powiadomienie znalezione.', type: NotificationEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono lub należy do innego użytkownika.' })
  findOneMine(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<NotificationEntity> {
    return this.notificationsService.getMyNotification(user.userId, id);
  }

  @Patch('notifications/me/:id/read')
  @ApiOperation({ summary: 'Oznaczenie własnego powiadomienia jako przeczytane', description: 'Idempotentne — ponowne wywołanie na już przeczytanym nie zmienia stanu.' })
  @ApiResponse({ status: 200, description: 'Powiadomienie oznaczone jako przeczytane (lub już nim było).', type: NotificationEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono lub należy do innego użytkownika.' })
  markAsRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<NotificationEntity> {
    return this.notificationsService.markAsRead(user.userId, id);
  }

  @Post('notifications/me/read-all')
  @ApiOperation({ summary: 'Oznaczenie wszystkich własnych powiadomień jako przeczytane', description: 'Naturalnie idempotentne — kolejne wywołania nie znajdują nic do zaktualizowania.' })
  @ApiResponse({ status: 201, description: 'Liczba zaktualizowanych powiadomień.' })
  markAllAsRead(@CurrentUser() user: AuthenticatedUser): Promise<{ updatedCount: number }> {
    return this.notificationsService.markAllAsRead(user.userId);
  }

  @Get('notifications')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Historia wysłanych powiadomień całej firmy' })
  @ApiResponse({ status: 200, description: 'Lista powiadomień.', type: [NotificationEntity] })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `notifications.view`.' })
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<NotificationEntity[]> {
    return this.notificationsService.listNotifications(user.companyId);
  }

  @Get('notifications/:id')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Szczegóły powiadomienia (widok administracyjny)' })
  @ApiResponse({ status: 200, description: 'Powiadomienie znalezione.', type: NotificationEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono (brak dedykowanego kodu w ERROR_CODES.md).' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `notifications.view`.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<NotificationEntity> {
    return this.notificationsService.getNotification(id);
  }

  @Get('cases/:caseId/notifications')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Powiadomienia wysłane w kontekście sprawy' })
  @ApiResponse({ status: 200, description: 'Lista powiadomień.', type: [NotificationEntity] })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `notifications.view`.' })
  findAllForCase(@Param('caseId', ParseUUIDPipe) caseId: string): Promise<NotificationEntity[]> {
    return this.notificationsService.listForCase(caseId);
  }

  @Get('notification-templates')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Lista szablonów (globalne + nadpisania firmy)' })
  @ApiResponse({ status: 200, description: 'Lista szablonów.', type: [NotificationTemplateEntity] })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `notifications.templates.manage`.' })
  findTemplates(@CurrentUser() user: AuthenticatedUser): Promise<NotificationTemplateEntity[]> {
    return this.notificationsService.listTemplates(user.companyId);
  }

  @Post('notification-templates')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Utworzenie nadpisania szablonu dla własnej firmy', description: 'NOTIFICATIONS.md §2.2 — szablony globalne (companyId=null) to dane startowe, nie tworzone tym endpointem.' })
  @ApiBody({ type: CreateTemplateDto })
  @ApiResponse({ status: 201, description: 'Szablon utworzony.', type: NotificationTemplateEntity })
  @ApiResponse({ status: 422, description: 'VALIDATION-001 — pola wymagane.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `notifications.templates.manage`.' })
  createTemplate(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTemplateDto): Promise<NotificationTemplateEntity> {
    return this.notificationsService.createTemplate(user.companyId, dto);
  }

  @Patch('notification-templates/:id')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Edycja szablonu', description: '`code`/`channel` niezmienne po utworzeniu (tożsamość szablonu, `@@unique`).' })
  @ApiBody({ type: UpdateTemplateDto })
  @ApiResponse({ status: 200, description: 'Szablon zaktualizowany.', type: NotificationTemplateEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono szablonu.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `notifications.templates.manage`.' })
  updateTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto): Promise<NotificationTemplateEntity> {
    return this.notificationsService.updateTemplate(id, dto);
  }
}
