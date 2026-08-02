import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UnprocessableEntityException,
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
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { IStorageService, STORAGE_SERVICE } from '../../storage/storage.interface';
import { DocumentsService } from './documents.service';
import { MarkDocumentInvalidDto } from './dto/mark-invalid.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentEntity } from './entities/document.entity';
import { mimeToDocumentType } from './mime-to-document-type';

/** Nazwa modułu w kodzie: "Documents". Pokrywa też przykładowy "Attachments" z zakresu zadania — DATABASE.md, tabela terminologii: Attachment = Document. */
@ApiTags('Documents')
@ApiBearerAuth()
@Controller('cases/:caseId/documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DOCUMENTS_VIEW)
  @ApiOperation({ summary: 'Lista załączników sprawy' })
  @ApiResponse({ status: 200, description: 'Lista dokumentów.', type: [DocumentEntity] })
  @ApiResponse({ status: 404, description: 'Nie znaleziono sprawy.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `documents.view`.' })
  findAll(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentEntity[]> {
    return this.documentsService.listDocuments(caseId, user.companyId);
  }

  @Get(':documentId')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_VIEW)
  @ApiOperation({ summary: 'Szczegóły załącznika' })
  @ApiResponse({ status: 200, description: 'Dokument znaleziony.', type: DocumentEntity })
  @ApiResponse({
    status: 404,
    description: 'Nie znaleziono sprawy/dokumentu (brak dedykowanego kodu w ERROR_CODES.md).',
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `documents.view`.' })
  findOne(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentEntity> {
    return this.documentsService.getDocument(caseId, documentId, user.companyId);
  }

  /**
   * `multipart/form-data` — pole `file` (binarium) + pola opisowe z
   * `UploadDocumentDto`. `fileName`/`fileType`/`mimeType`/`fileSize`/
   * `storagePath` z `CreateDocumentDto` (wymagane przez `DocumentsService`,
   * Zadanie 17, bez zmian) są wyprowadzane TUTAJ z samego pliku + zapisu
   * przez `IStorageService` — `IStorageService` był w `DECISIONS.md`
   * zaplanowany od początku ("dysk lokalny w MVP"), ale nigdy nie
   * zaimplementowany; ten endpoint to pierwsze realne podłączenie.
   */
  @Post()
  @RequirePermissions(PERMISSIONS.DOCUMENTS_UPLOAD)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Dodanie załącznika do sprawy (lub jej pozycji)',
    description:
      'Plik binarny (pole `file`) zapisywany przez `IStorageService` (dysk lokalny, MVP). Attach do sprawy następuje TU, przy tworzeniu (`caseId` wymagane w schemacie) — nie ma osobnego kroku "attach".',
  })
  @ApiBody({ type: UploadDocumentDto })
  @ApiResponse({ status: 201, description: 'Dokument dodany.', type: DocumentEntity })
  @ApiResponse({
    status: 404,
    description: 'Nie znaleziono sprawy lub `caseItemId` nie należy do tej sprawy.',
  })
  @ApiResponse({
    status: 422,
    description: 'VALIDATION-001 — plik wymagany / nieobsługiwany format.',
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `documents.upload`.' })
  async upload(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ): Promise<DocumentEntity> {
    if (!file) {
      throw new UnprocessableEntityException('Plik jest wymagany.');
    }

    const fileType = mimeToDocumentType(file.mimetype);
    const stored = await this.storageService.save(user.companyId, caseId, file);

    return this.documentsService.uploadDocument(caseId, user.userId, user.companyId, {
      caseItemId: dto.caseItemId,
      category: dto.category,
      visibility: dto.visibility,
      fileName: stored.fileName,
      fileType,
      mimeType: stored.mimeType,
      fileSize: stored.fileSize,
      storagePath: stored.storagePath,
    });
  }

  /** Strumieniuje binarium z dysku — `getDocument()` już egzekwuje `documents.view` + izolację dzierżawy (companyId/caseId), więc odczyt pliku jest tak samo zabezpieczony jak odczyt metadanych. */
  @Get(':documentId/file')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_VIEW)
  @ApiOperation({ summary: 'Pobranie binarium załącznika' })
  @ApiResponse({ status: 200, description: 'Strumień pliku.' })
  @ApiResponse({ status: 404, description: 'Nie znaleziono sprawy/dokumentu.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `documents.view`.' })
  async downloadFile(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const document = await this.documentsService.getDocumentFile(
      caseId,
      documentId,
      user.companyId,
    );
    const buffer = await this.storageService.read(document.storagePath);
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(document.fileName)}"`,
    );
    res.send(buffer);
  }

  @Post(':documentId/mark-invalid')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_MARK_INVALID)
  @ApiOperation({
    summary:
      'Oznaczenie dokumentu jako błędny (odpowiednik "usunięcia" — BR-020, nigdy fizyczne usunięcie)',
  })
  @ApiBody({ type: MarkDocumentInvalidDto })
  @ApiResponse({
    status: 201,
    description: 'Dokument oznaczony jako błędny (lub już nim był — operacja idempotentna).',
    type: DocumentEntity,
  })
  @ApiResponse({ status: 404, description: 'Nie znaleziono sprawy/dokumentu.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `documents.markInvalid`.' })
  markInvalid(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkDocumentInvalidDto,
  ): Promise<DocumentEntity> {
    return this.documentsService.markInvalid(
      caseId,
      documentId,
      user.companyId,
      user.userId,
      dto.reason,
    );
  }
}
