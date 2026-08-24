import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CasesService } from './cases.service';
import { AssignOwnerDto } from './dto/assign-owner.dto';
import { CancelCaseDto } from './dto/cancel-case.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateCaseDto } from './dto/create-case.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { IssueReplacementDto, ReturnReplacementDto } from './dto/replacement.dto';
import { RequestInfoDto } from './dto/request-info.dto';
import { SearchCasesDto } from './dto/search-cases.dto';
import { SetDecisionDto } from './dto/set-decision.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { UpdateCaseItemDto } from './dto/update-case-item.dto';
import { CaseEntity } from './entities/case.entity';
import { PortalCredentialEntity } from './entities/portal-credential.entity';

/**
 * Endpointy odzwierciedlają `STATE_MACHINE.md`/`WORKFLOW.md` §8 (przejścia,
 * decyzja, anulowanie) i §6 (opiekun, notatki, wiadomości, produkt
 * zastępczy). Kolejność dozwolonych przejść — `case-status.rules.ts`,
 * egzekwowana wyłącznie w `CasesService`.
 *
 * Endpointy przejść statusu (`/status`, `/cancel`, `/archive`,
 * `/request-info`, `/decision`) mają CELOWO szerszy, sumaryczny guard
 * (`@RequirePermissions` z kilkoma kodami naraz, semantyka "którekolwiek") —
 * to tylko zgrubny pre-filtr. STATE_MACHINE.md przypisuje RÓŻNE uprawnienie
 * RÓŻNYM przejściom z tego samego statusu (np. `cases.status.change` vs.
 * `cases.cancel` z `Weryfikacja`), czego pojedynczy dekorator nie wyrazi —
 * ostateczną, precyzyjną decyzję podejmuje `CasesService` na podstawie
 * `user.permissions` przekazanych jawnie.
 */
@ApiTags('Cases')
@ApiBearerAuth()
@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CASES_VIEW)
  @ApiOperation({
    summary: 'Lista/wyszukiwanie spraw firmy',
    description: 'Bez `query` — pełna lista. Z `query` — wyszukiwanie po numerze sprawy.',
  })
  @ApiResponse({ status: 200, description: 'Lista spraw.', type: [CaseEntity] })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `cases.view`.' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchCasesDto,
  ): Promise<CaseEntity[]> {
    return query.query
      ? this.casesService.search(user.companyId, query.query)
      : this.casesService.findAllForCompany(user.companyId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CASES_VIEW)
  @ApiOperation({ summary: 'Szczegóły sprawy (wraz z pozycjami)' })
  @ApiResponse({ status: 200, description: 'Sprawa znaleziona.', type: CaseEntity })
  @ApiResponse({ status: 404, description: 'CASE-012 — nie znaleziono sprawy.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `cases.view`.' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CaseEntity> {
    return this.casesService.findById(id, user.companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CASES_CREATE)
  @ApiOperation({
    summary: 'Rejestracja nowej reklamacji',
    description:
      'Weryfikuje istnienie customerId/shopId/productId/orderItemId przed zapisem. BR-097 (CASE-007)/BR-105 egzekwowane w serwisie.',
  })
  @ApiBody({ type: CreateCaseDto })
  @ApiResponse({ status: 201, description: 'Sprawa utworzona.', type: CaseEntity })
  @ApiResponse({
    status: 404,
    description: 'Nie znaleziono customerId/shopId/productId/orderItemId.',
  })
  @ApiResponse({
    status: 422,
    description:
      'CASE-007 (BezposrednioDoProducenta wymaga Warranty) / VALIDATION-001 (opis/rozwiązanie wymagane poza ścieżką monitorowaną).',
  })
  @ApiResponse({
    status: 409,
    description:
      'CASE-013 — kolizja generatora numeru sprawy (rzadkie, automatyczny retry wewnętrzny wyczerpany).',
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `cases.create`.' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCaseDto): Promise<CaseEntity> {
    return this.casesService.create(user.companyId, dto, user.userId);
  }

  /** RBAC.md §5 — TRWAŁE usunięcie, wyjątek od reguły "nic nigdy nie jest kasowane" obowiązującej w reszcie aplikacji. Wyłącznie Administrator (jedyna rola z `cases.delete` w standardowej macierzy). Do czyszczenia spraw testowych z panelu admina — nie do obsługi realnych reklamacji. */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CASES_DELETE)
  @ApiOperation({
    summary: 'TRWAŁE usunięcie sprawy (nieodwracalne)',
    description:
      'Jedyny hard-delete w aplikacji — kasuje sprawę i WSZYSTKIE powiązane dane (dokumenty, wiadomości, historię, notatki). Wyłącznie do spraw testowych.',
  })
  @ApiResponse({ status: 204, description: 'Sprawa trwale usunięta.' })
  @ApiResponse({ status: 404, description: 'CASE-012 — nie znaleziono sprawy.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `cases.delete`.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.casesService.hardDelete(id, user.companyId, user.userId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CASES_EDIT)
  @ApiOperation({
    summary: 'Edycja danych sprawy',
    description:
      'Pola opisowe (opis, oczekiwane rozwiązanie, priorytet) — status/decyzja mają własne endpointy.',
  })
  @ApiBody({ type: UpdateCaseDto })
  @ApiResponse({ status: 200, description: 'Sprawa zaktualizowana.', type: CaseEntity })
  @ApiResponse({ status: 404, description: 'CASE-012 — nie znaleziono sprawy.' })
  @ApiResponse({ status: 409, description: 'CASE-008 — sprawa w statusie końcowym.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `cases.edit`.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CaseEntity> {
    return this.casesService.update(id, user.companyId, dto, user.userId);
  }

  @Patch(':id/items/:itemId')
  @RequirePermissions(PERMISSIONS.CASES_EDIT)
  @ApiOperation({
    summary: 'Edycja danych pozycji sprawy',
    description:
      'Poprawa błędnie wpisanego modelu/producenta/numeru seryjnego/ramy/dowodu zakupu (BR-072/BR-074) — do tej pory brak takiej opcji, jedyna droga edycji było `PATCH /cases/:id`, które obejmuje wyłącznie pola całej sprawy.',
  })
  @ApiBody({ type: UpdateCaseItemDto })
  @ApiResponse({ status: 200, description: 'Sprawa zaktualizowana.', type: CaseEntity })
  @ApiResponse({ status: 404, description: 'CASE-012 — nie znaleziono sprawy lub pozycji.' })
  @ApiResponse({ status: 409, description: 'CASE-008 — sprawa w statusie końcowym.' })
  @ApiResponse({
    status: 422,
    description: 'CASE-004/005/006 — brak wymaganych danych dla wybranego producenta.',
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `cases.edit`.' })
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCaseItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CaseEntity> {
    return this.casesService.updateItem(id, itemId, user.companyId, dto, user.userId);
  }

  @Put(':id/status')
  @RequirePermissions(
    PERMISSIONS.CASES_STATUS_CHANGE,
    PERMISSIONS.CASES_CANCEL,
    PERMISSIONS.CASES_DECISION_SET,
    PERMISSIONS.CASES_DECISION_APPROVE,
    PERMISSIONS.CASES_INFO_REQUEST_SEND,
  )
  @ApiOperation({
    summary: 'Zmiana statusu sprawy',
    description:
      'Legalność i dokładne wymagane uprawnienie per przejście — STATE_MACHINE.md, egzekwowane w CasesService.',
  })
  @ApiBody({ type: ChangeStatusDto })
  @ApiResponse({ status: 200, description: 'Status zmieniony.', type: CaseEntity })
  @ApiResponse({ status: 404, description: 'CASE-012 — nie znaleziono sprawy.' })
  @ApiResponse({
    status: 409,
    description: 'CASE-001 — przejście nieosiągalne z bieżącego statusu.',
  })
  @ApiResponse({
    status: 422,
    description: 'CASE-009 (decyzja nieustawiona) / CASE-011 (powód wymagany dla Anulowana).',
  })
  @ApiResponse({
    status: 403,
    description: 'RBAC-001 — brak konkretnego uprawnienia wymaganego dla TEGO przejścia.',
  })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CaseEntity> {
    return this.casesService.changeStatus(
      id,
      user.companyId,
      dto.status,
      user.userId,
      user.permissions,
      dto.notifyCustomer,
    );
  }

  @Put(':id/decision')
  @RequirePermissions(PERMISSIONS.CASES_DECISION_SET, PERMISSIONS.CASES_DECISION_APPROVE)
  @ApiOperation({
    summary: 'Ustawienie decyzji w sprawie',
    description:
      'Nie zmienia statusu — WORKFLOW.md §6 poz. 3, osobne od przejścia w RealizacjaDecyzji.',
  })
  @ApiBody({ type: SetDecisionDto })
  @ApiResponse({ status: 200, description: 'Decyzja ustawiona.', type: CaseEntity })
  @ApiResponse({ status: 404, description: 'CASE-012 — nie znaleziono sprawy.' })
  @ApiResponse({ status: 409, description: 'CASE-008 — sprawa w statusie końcowym.' })
  @ApiResponse({
    status: 403,
    description: 'CASE-010 (ZwrotSrodkow/rękojmia wymaga `cases.decision.approve`) / RBAC-001.',
  })
  setDecision(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetDecisionDto,
  ): Promise<CaseEntity> {
    return this.casesService.setDecision(
      id,
      user.companyId,
      dto.decision,
      user.userId,
      user.permissions,
      {
        decisionContractorId: dto.decisionContractorId,
        decisionJustification: dto.decisionJustification,
        decisionFulfillmentMethod: dto.decisionFulfillmentMethod,
        decisionManufacturerResponse: dto.decisionManufacturerResponse,
      },
    );
  }

  @Put(':id/owner')
  @RequirePermissions(PERMISSIONS.CASES_ASSIGN)
  @ApiOperation({ summary: 'Przeniesienie sprawy na innego opiekuna' })
  @ApiBody({ type: AssignOwnerDto })
  @ApiResponse({ status: 200, description: 'Opiekun zmieniony.', type: CaseEntity })
  @ApiResponse({ status: 404, description: 'CASE-012 — nie znaleziono sprawy.' })
  @ApiResponse({ status: 409, description: 'CASE-008 — sprawa w statusie końcowym.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `cases.assign`.' })
  assignOwner(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignOwnerDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CaseEntity> {
    return this.casesService.assignOwner(id, user.companyId, dto.ownerId, user.userId);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.CASES_CANCEL)
  @ApiOperation({
    summary: 'Anulowanie sprawy',
    description: 'Dostępne z dowolnego statusu aktywnego. CASE-011 — powód wymagany.',
  })
  @ApiBody({ type: CancelCaseDto })
  @ApiResponse({ status: 201, description: 'Sprawa anulowana.', type: CaseEntity })
  @ApiResponse({ status: 422, description: 'CASE-011 — powód wymagany.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `cases.cancel`.' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CaseEntity> {
    return this.casesService.cancel(id, user.companyId, dto.reason, user.userId, user.permissions);
  }

  /** WORKFLOW.md §5 — wyłącznie z `Zamknieta`; retencja automatyczna to osobne zadanie cykliczne. */
  @Post(':id/archive')
  @RequirePermissions(PERMISSIONS.CASES_ARCHIVE)
  @ApiOperation({
    summary: 'Ręczna archiwizacja sprawy',
    description:
      'Legalne wyłącznie z Zamknieta (egzekwowane przez tabelę przejść — CASE-001 w przeciwnym razie).',
  })
  @ApiResponse({ status: 201, description: 'Sprawa zarchiwizowana.', type: CaseEntity })
  @ApiResponse({ status: 409, description: 'CASE-001 — sprawa nie jest w statusie Zamknieta.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `cases.archive`.' })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CaseEntity> {
    return this.casesService.archive(id, user.companyId, user.userId, user.permissions);
  }

  /** WORKFLOW.md §6 poz. 4 — "Poproś o uzupełnienie danych". */
  @Post(':id/request-info')
  @RequirePermissions(PERMISSIONS.CASES_INFO_REQUEST_SEND)
  @ApiOperation({
    summary: 'Prośba o uzupełnienie danych od klienta',
    description:
      'Przejście do OczekiwanieNaKlienta (WORKFLOW.md §4), wpis CaseHistory InfoRequested.',
  })
  @ApiBody({ type: RequestInfoDto })
  @ApiResponse({
    status: 201,
    description: 'Sprawa przeszła w oczekiwanie na klienta.',
    type: CaseEntity,
  })
  @ApiResponse({ status: 409, description: 'CASE-001 — nielegalne z bieżącego statusu.' })
  @ApiResponse({
    status: 403,
    description: 'RBAC-001 — brak uprawnienia `cases.infoRequest.send`.',
  })
  requestInfo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestInfoDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CaseEntity> {
    return this.casesService.requestInfo(id, user.companyId, dto, user.userId, user.permissions);
  }

  /** WORKFLOW.md §6 poz. 13 — `value` w odpowiedzi to kod dostępu jawnym tekstem, pokazywany JEDEN raz. Poza zakresem Zadania 16 (bez zmian). */
  @Post(':id/portal/enable')
  @RequirePermissions(PERMISSIONS.CASES_PORTAL_MANAGE)
  enablePortal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PortalCredentialEntity> {
    return this.casesService.enablePortal(id, user.companyId);
  }

  /** WORKFLOW.md §6 poz. 21. Poza zakresem Zadania 16 (bez zmian). */
  @Post(':id/portal/disable')
  @RequirePermissions(PERMISSIONS.CASES_PORTAL_MANAGE)
  disablePortal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CaseEntity> {
    return this.casesService.disablePortal(id, user.companyId);
  }

  /** WORKFLOW.md §6 poz. 14 — `value` to token linku jawnym tekstem, pokazywany JEDEN raz. Poza zakresem Zadania 16 (bez zmian). */
  @Post(':id/portal/secure-link')
  @RequirePermissions(PERMISSIONS.CASES_PORTAL_MANAGE)
  generateSecureLink(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PortalCredentialEntity> {
    return this.casesService.generateSecureLink(id, user.companyId);
  }

  @Get(':id/history')
  @RequirePermissions(PERMISSIONS.CASES_VIEW)
  findHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.casesService.findHistory(id, user.companyId);
  }

  @Get(':id/notes')
  @RequirePermissions(PERMISSIONS.NOTES_VIEW)
  findNotes(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.casesService.findNotes(id, user.companyId);
  }

  @Post(':id/notes')
  @RequirePermissions(PERMISSIONS.NOTES_CREATE)
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNoteDto,
  ) {
    return this.casesService.addNote(id, user.companyId, user.userId, dto.content);
  }

  @Get(':id/messages')
  @RequirePermissions(PERMISSIONS.MESSAGES_VIEW)
  findMessages(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.casesService.findMessages(id, user.companyId);
  }

  @Post(':id/messages')
  @RequirePermissions(PERMISSIONS.MESSAGES_SEND)
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMessageDto,
  ) {
    return this.casesService.sendMessage(id, user.companyId, user.userId, dto);
  }

  @Post(':id/messages/read')
  @RequirePermissions(PERMISSIONS.MESSAGES_VIEW)
  async markMessagesRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.casesService.markMessagesRead(id, user.companyId);
    return { success: true };
  }

  /** Poza zakresem Zadania 16 (bez zmian) — moduł Logistics nie zamówiony. */
  @Get(':id/logistics')
  @RequirePermissions(PERMISSIONS.CASES_VIEW)
  findLogistics(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.casesService.findLogistics(id, user.companyId);
  }

  /** Poza zakresem Zadania 16 (bez zmian) — moduł Replacement nie zamówiony. */
  @Post('items/:caseItemId/replacement')
  @RequirePermissions(PERMISSIONS.CASES_REPLACEMENT_MANAGE)
  issueReplacement(
    @Param('caseItemId', ParseUUIDPipe) caseItemId: string,
    @Body() dto: IssueReplacementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.casesService.issueReplacement(
      caseItemId,
      user.companyId,
      dto.productIdentifier,
      dto.plannedReturnAt ? new Date(dto.plannedReturnAt) : undefined,
    );
  }

  @Post('items/:caseItemId/replacement/return')
  @RequirePermissions(PERMISSIONS.CASES_REPLACEMENT_MANAGE)
  returnReplacement(
    @Param('caseItemId', ParseUUIDPipe) caseItemId: string,
    @Body() dto: ReturnReplacementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.casesService.returnReplacement(caseItemId, user.companyId, dto.conditionOnReturn);
  }
}
