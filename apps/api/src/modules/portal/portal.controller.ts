import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { CaseCompletenessEntity } from '../cases/entities/case-completeness.entity';
import { DOCUMENT_MAX_SIZE_BYTES } from '../documents/document-upload.constants';
import { mimeToDocumentType } from '../documents/mime-to-document-type';
import { IStorageService, STORAGE_SERVICE } from '../../storage/storage.interface';
import { PortalCaseId } from './decorators/portal-case-id.decorator';
import { PortalLoginTokenDto } from './dto/portal-login-token.dto';
import { PortalLoginDto } from './dto/portal-login.dto';
import { RecordPortalConsentDto } from './dto/record-portal-consent.dto';
import { SendPortalMessageDto } from './dto/send-portal-message.dto';
import { UpdatePortalCaseItemDto } from './dto/update-portal-case-item.dto';
import { UploadPortalDocumentDto } from './dto/upload-portal-document.dto';
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
  constructor(
    private readonly portalService: PortalService,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  loginWithAccessCode(
    @Body() dto: PortalLoginDto,
    @Req() req: Request,
  ): Promise<PortalSessionEntity> {
    return this.portalService.loginWithAccessCode(dto, req.ip ?? 'unknown');
  }

  @Public()
  @Post('login/token')
  @HttpCode(HttpStatus.OK)
  loginWithSecureToken(
    @Body() dto: PortalLoginTokenDto,
    @Req() req: Request,
  ): Promise<PortalSessionEntity> {
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

  /** Multipart — pole `file` (binarium) + `caseItemId`/`category` opisowe, ten sam wzorzec co `DocumentsController.upload`. Limit rozmiaru — patrz `DOCUMENT_MAX_SIZE_BYTES`. */
  @Public()
  @UseGuards(PortalAccessGuard)
  @Post('case/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DOCUMENT_MAX_SIZE_BYTES } }))
  async uploadDocument(
    @PortalCaseId() caseId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadPortalDocumentDto,
  ): Promise<PortalDocumentEntity> {
    if (!file) {
      throw new AppException(
        ERROR_CODES.VALIDATION_001.code,
        'Plik jest wymagany.',
        ERROR_CODES.VALIDATION_001.status,
      );
    }
    // `companyId` z zaufanego `caseId` tokenu portalu — `resolveCompanyId` sprawdza po
    // drodze, że portal jest dla tej sprawy włączony (ten sam `getCaseOrThrow`, co
    // `uploadDocument` wywoła jeszcze raz przy zapisie — podwójny, tani odczyt zamiast
    // zapisu pliku pod błędną/nieistniejącą ścieżką).
    const companyId = await this.portalService.resolveCompanyId(caseId);
    const fileType = mimeToDocumentType(file.mimetype);
    const stored = await this.storageService.save(companyId, caseId, file);
    return this.portalService.uploadDocument(caseId, {
      caseItemId: dto.caseItemId,
      category: dto.category,
      fileName: stored.fileName,
      fileType,
      mimeType: stored.mimeType,
      fileSize: stored.fileSize,
      storagePath: stored.storagePath,
    });
  }

  @Public()
  @UseGuards(PortalAccessGuard)
  @Get('case/messages')
  getMessages(@PortalCaseId() caseId: string): Promise<PortalMessageEntity[]> {
    return this.portalService.getMessages(caseId);
  }

  @Public()
  @UseGuards(PortalAccessGuard)
  @Post('case/messages')
  sendMessage(
    @PortalCaseId() caseId: string,
    @Body() dto: SendPortalMessageDto,
  ): Promise<PortalMessageEntity> {
    return this.portalService.sendMessage(caseId, dto.content, dto.documentIds);
  }

  @Public()
  @UseGuards(PortalAccessGuard)
  @Post('case/messages/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markMessagesRead(@PortalCaseId() caseId: string): Promise<void> {
    await this.portalService.markMessagesRead(caseId);
  }

  @Public()
  @UseGuards(PortalAccessGuard)
  @Get('case/completeness')
  getCompleteness(@PortalCaseId() caseId: string): Promise<CaseCompletenessEntity> {
    return this.portalService.getCompleteness(caseId);
  }

  @Public()
  @UseGuards(PortalAccessGuard)
  @Patch('case/items/:itemId')
  updateItemFields(
    @PortalCaseId() caseId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdatePortalCaseItemDto,
  ): Promise<PortalCaseViewEntity> {
    return this.portalService.updateItemFields(caseId, itemId, dto);
  }

  @Public()
  @UseGuards(PortalAccessGuard)
  @Post('case/consent')
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordConsent(
    @PortalCaseId() caseId: string,
    @Body() dto: RecordPortalConsentDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.portalService.recordConsent(
      caseId,
      dto,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );
  }
}
