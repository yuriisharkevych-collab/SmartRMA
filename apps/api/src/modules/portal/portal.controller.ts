import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PortalCaseId } from './decorators/portal-case-id.decorator';
import { PortalLoginTokenDto } from './dto/portal-login-token.dto';
import { PortalLoginDto } from './dto/portal-login.dto';
import { SendPortalMessageDto } from './dto/send-portal-message.dto';
import { PortalCaseViewEntity } from './entities/portal-case-view.entity';
import { PortalDocumentEntity } from './entities/portal-document.entity';
import { PortalHistoryEntryEntity } from './entities/portal-history-entry.entity';
import { PortalMessageEntity } from './entities/portal-message.entity';
import { PortalSessionEntity } from './entities/portal-session.entity';
import { PortalAccessGuard } from './guards/portal-access.guard';
import { PortalService } from './portal.service';

/**
 * Odrębna gałąź API od `/cases` — RBAC.md §1.2: Portal Klienta to
 * MECHANIZM, nie rola. Wszystkie trasy `@Public()` (pomijają `JwtAuthGuard`
 * pracowniczy); `/case/*` dodatkowo za `PortalAccessGuard` (własny token).
 */
@ApiTags('Portal')
@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  loginWithAccessCode(@Body() dto: PortalLoginDto, @Req() req: Request): Promise<PortalSessionEntity> {
    return this.portalService.loginWithAccessCode(dto, req.ip ?? 'unknown');
  }

  @Public()
  @Post('login/token')
  @HttpCode(HttpStatus.OK)
  loginWithSecureToken(@Body() dto: PortalLoginTokenDto, @Req() req: Request): Promise<PortalSessionEntity> {
    return this.portalService.loginWithSecureToken(dto, req.ip ?? 'unknown');
  }

  @Public()
  @UseGuards(PortalAccessGuard)
  @Get('case')
  getCase(@PortalCaseId() caseId: string): Promise<PortalCaseViewEntity> {
    return this.portalService.getCaseView(caseId);
  }

  @Public()
  @UseGuards(PortalAccessGuard)
  @Get('case/history')
  getHistory(@PortalCaseId() caseId: string): Promise<PortalHistoryEntryEntity[]> {
    return this.portalService.getHistory(caseId);
  }

  @Public()
  @UseGuards(PortalAccessGuard)
  @Get('case/documents')
  getDocuments(@PortalCaseId() caseId: string): Promise<PortalDocumentEntity[]> {
    return this.portalService.getDocuments(caseId);
  }

  @Public()
  @UseGuards(PortalAccessGuard)
  @Post('case/messages')
  sendMessage(@PortalCaseId() caseId: string, @Body() dto: SendPortalMessageDto): Promise<PortalMessageEntity> {
    return this.portalService.sendMessage(caseId, dto.content);
  }
}
