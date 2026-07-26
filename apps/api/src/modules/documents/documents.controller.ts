import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { MarkDocumentInvalidDto } from './dto/mark-invalid.dto';
import { DocumentEntity } from './entities/document.entity';

/** Nazwa modułu w kodzie: "Documents". Pokrywa też przykładowy "Attachments" z zakresu zadania — DATABASE.md, tabela terminologii: Attachment = Document. */
@ApiTags('Documents')
@ApiBearerAuth()
@Controller('cases/:caseId/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DOCUMENTS_VIEW)
  @ApiOperation({ summary: 'Lista załączników sprawy' })
  @ApiResponse({ status: 200, description: 'Lista dokumentów.', type: [DocumentEntity] })
  @ApiResponse({ status: 404, description: 'Nie znaleziono sprawy.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `documents.view`.' })
  findAll(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUser() user: AuthenticatedUser): Promise<DocumentEntity[]> {
    return this.documentsService.listDocuments(caseId, user.companyId);
  }

  @Get(':documentId')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_VIEW)
  @ApiOperation({ summary: 'Szczegóły załącznika' })
  @ApiResponse({ status: 200, description: 'Dokument znaleziony.', type: DocumentEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono sprawy/dokumentu (brak dedykowanego kodu w ERROR_CODES.md).' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `documents.view`.' })
  findOne(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentEntity> {
    return this.documentsService.getDocument(caseId, documentId, user.companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DOCUMENTS_UPLOAD)
  @ApiOperation({
    summary: 'Dodanie załącznika do sprawy (lub jej pozycji)',
    description: 'Metadane pliku — binarium przez osobny upload (poza zakresem, patrz `IStorageService`). Attach do sprawy następuje TU, przy tworzeniu (`caseId` wymagane w schemacie) — nie ma osobnego kroku "attach".',
  })
  @ApiBody({ type: CreateDocumentDto })
  @ApiResponse({ status: 201, description: 'Dokument dodany.', type: DocumentEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono sprawy lub `caseItemId` nie należy do tej sprawy.' })
  @ApiResponse({ status: 422, description: 'VALIDATION-001 — pola wymagane / nieprawidłowy `fileType`.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `documents.upload`.' })
  upload(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDocumentDto,
  ): Promise<DocumentEntity> {
    return this.documentsService.uploadDocument(caseId, user.userId, user.companyId, dto);
  }

  @Post(':documentId/mark-invalid')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_MARK_INVALID)
  @ApiOperation({
    summary: 'Oznaczenie dokumentu jako błędny (odpowiednik "usunięcia" — BR-020, nigdy fizyczne usunięcie)',
  })
  @ApiBody({ type: MarkDocumentInvalidDto })
  @ApiResponse({ status: 201, description: 'Dokument oznaczony jako błędny (lub już nim był — operacja idempotentna).', type: DocumentEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono sprawy/dokumentu.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `documents.markInvalid`.' })
  markInvalid(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkDocumentInvalidDto,
  ): Promise<DocumentEntity> {
    return this.documentsService.markInvalid(caseId, documentId, user.companyId, user.userId, dto.reason);
  }
}
